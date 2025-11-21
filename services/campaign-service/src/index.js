require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Load shared utilities - mounted at /usr/src/app/shared in container
const { connectDB } = require('/usr/src/app/shared/utils/mongodb');

const { register, metricsMiddleware } = require('./metrics');
const campaignRoutes = require('./routes/campaigns');

const PORT = process.env.PORT || 3002;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017';
const DB_NAME = 'campaigns_db';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

// Routes
app.use('/campaigns', campaignRoutes);

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'campaign-service' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[campaign-service] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    // Connect to MongoDB
    await connectDB(`${MONGODB_URI}/${DB_NAME}`);
    console.log('[campaign-service] Connected to MongoDB');

    app.listen(PORT, () => {
      console.log(`[campaign-service] Listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('[campaign-service] Failed to start:', error);
    process.exit(1);
  }
}

start();
