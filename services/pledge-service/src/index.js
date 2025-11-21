require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Load shared utilities
const { connectDB } = require('/usr/src/app/shared/utils/mongodb');

const { register, metricsMiddleware } = require('./metrics');
const pledgeRoutes = require('./routes/pledges');
const { startWorker } = require('./workers/outboxWorker');

const PORT = process.env.PORT || 3003;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017';
const DB_NAME = 'pledges_db';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

// Routes
app.use('/pledges', pledgeRoutes);
app.use('/internal/pledges', pledgeRoutes);

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'pledge-service' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[pledge-service] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    // Connect to MongoDB
    await connectDB(`${MONGODB_URI}/${DB_NAME}`);
    console.log('[pledge-service] Connected to MongoDB');

    // Start outbox worker
    startWorker();

    app.listen(PORT, () => {
      console.log(`[pledge-service] Listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('[pledge-service] Failed to start:', error);
    process.exit(1);
  }
}

start();
