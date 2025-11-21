// Test setup and teardown for integration tests
const { MongoClient } = require('mongodb');

// Test configuration
const TEST_CONFIG = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:8080',
  RABBITMQ_URI:
    process.env.RABBITMQ_URI || 'amqp://admin:admin123@localhost:5672',
};

// Global test database connection
let mongoClient;
let testDbs = {};

// Setup before all tests
beforeAll(async () => {
  console.log('Setting up integration tests...');

  // Connect to MongoDB
  try {
    mongoClient = new MongoClient(TEST_CONFIG.MONGODB_URI);
    await mongoClient.connect();
    console.log('Connected to MongoDB for testing');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
});

// Cleanup after all tests
afterAll(async () => {
  console.log('Cleaning up integration tests...');

  if (mongoClient) {
    await mongoClient.close();
    console.log('Closed MongoDB connection');
  }
});

// Helper function to get test database
function getTestDb(dbName) {
  if (!testDbs[dbName]) {
    testDbs[dbName] = mongoClient.db(dbName);
  }
  return testDbs[dbName];
}

// Helper function to clean test data
async function cleanTestData() {
  const databases = [
    'identity_db',
    'campaigns_db',
    'pledges_db',
    'payments_db',
    'totals_db',
  ];

  for (const dbName of databases) {
    try {
      const db = getTestDb(dbName);
      const collections = await db.listCollections().toArray();

      for (const collection of collections) {
        await db.collection(collection.name).deleteMany({});
      }
    } catch (error) {
      console.error(`Error cleaning ${dbName}:`, error);
    }
  }
}

// Helper to wait/sleep
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to generate UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Export helpers
module.exports = {
  TEST_CONFIG,
  getTestDb,
  cleanTestData,
  sleep,
  generateUUID,
};
