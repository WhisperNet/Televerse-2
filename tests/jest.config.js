module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/integration/**/*.test.js'],
  testTimeout: 60000, // 60 seconds for integration tests
  verbose: true,
  collectCoverage: true,
  coverageDirectory: 'tests/coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.js'],
};
