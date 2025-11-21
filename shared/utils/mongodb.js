const mongoose = require('mongoose');

const DEFAULT_OPTIONS = {
  autoIndex: false,
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 10,
};

const MAX_RETRIES = Number(process.env.MONGO_MAX_RETRIES || 5);
const RETRY_DELAY_MS = Number(process.env.MONGO_RETRY_DELAY_MS || 2000);

mongoose.set('strictQuery', true);

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectDB(uri, options = {}) {
  if (!uri) {
    throw new Error('connectDB requires a MongoDB URI');
  }

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      await mongoose.connect(uri, { ...DEFAULT_OPTIONS, ...options });
      const connection = mongoose.connection;

      connection.on('disconnected', () => {
        console.warn('[mongodb] connection lost, attempting to reconnect');
      });

      return connection;
    } catch (error) {
      attempt += 1;
      console.error(`[mongodb] connection attempt ${attempt} failed:`, error.message);
      if (attempt >= MAX_RETRIES) {
        throw error;
      }
      await wait(RETRY_DELAY_MS * attempt);
    }
  }

  throw new Error('Unable to connect to MongoDB');
}

module.exports = {
  connectDB,
  mongoose,
};
