require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Load shared utilities - mounted at /usr/src/app/shared in container
const { connectDB } = require('/usr/src/app/shared/utils/mongodb');

const { register, metricsMiddleware } = require('./metrics');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017';
const DB_NAME = 'identity_db';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

// Routes
app.use('/auth', authRoutes);
app.use('/users', userRoutes);

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'identity-service' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[identity-service] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    // Connect to MongoDB
    await connectDB(`${MONGODB_URI}/${DB_NAME}`);
    console.log('[identity-service] Connected to MongoDB');

    app.listen(PORT, () => {
      console.log(`[identity-service] Listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('[identity-service] Failed to start:', error);
    process.exit(1);
  }
}

start();
