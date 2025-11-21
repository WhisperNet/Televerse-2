require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Load shared utilities
const { connectDB } = require('/usr/src/app/shared/utils/mongodb');

const { register, metricsMiddleware } = require('./metrics');
const paymentRoutes = require('./routes/payments');

const PORT = process.env.PORT || 3004;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017';
const DB_NAME = 'payments_db';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

// Routes
app.use('/payments', paymentRoutes);

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'payment-service' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[payment-service] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    // Connect to MongoDB
    await connectDB(`${MONGODB_URI}/${DB_NAME}`);
    console.log('[payment-service] Connected to MongoDB');

    app.listen(PORT, () => {
      console.log(`[payment-service] Listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('[payment-service] Failed to start:', error);
    process.exit(1);
  }
}

start();
