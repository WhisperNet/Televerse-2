require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Load shared utilities
const { connectDB } = require('/usr/src/app/shared/utils/mongodb');

const { register, metricsMiddleware } = require('./metrics');
const totalsRoutes = require('./routes/totals');
const { startConsumer } = require('./consumers/pledgeCaptured');

const PORT = process.env.PORT || 3005;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017';
const DB_NAME = 'totals_db';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

// Routes
app.use('/totals', totalsRoutes);

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'totals-service' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[totals-service] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    // Connect to MongoDB
    await connectDB(`${MONGODB_URI}/${DB_NAME}`);
    console.log('[totals-service] Connected to MongoDB');

    // Start RabbitMQ consumer
    await startConsumer();

    app.listen(PORT, () => {
      console.log(`[totals-service] Listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('[totals-service] Failed to start:', error);
    process.exit(1);
  }
}

start();
