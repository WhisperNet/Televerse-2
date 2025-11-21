// State Machine Validation Tests
const request = require('supertest');
const { TEST_CONFIG, cleanTestData, sleep, generateUUID } = require('./setup');

const API_URL = TEST_CONFIG.API_BASE_URL;

describe('State Machine Validation Tests', () => {
  let authToken;
  let campaignId;

  beforeAll(async () => {
    await cleanTestData();

    // Create user and campaign for testing
    const userResponse = await request(API_URL)
      .post('/api/auth/register')
      .send({
        name: 'State Machine Test User',
        email: `state-machine-test-${Date.now()}@example.com`,
        password: 'test123456',
      });

    authToken = userResponse.body.token;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 30);

    const campaignResponse = await request(API_URL)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'State Machine Test Campaign',
        description: 'Campaign for state machine testing',
        goalAmount: 5000,
        category: 'Medical',
        endDate: tomorrow.toISOString(),
      });

    campaignId = campaignResponse.body._id;
  });

  describe('Valid State Transitions', () => {
    it('should allow PENDING → AUTHORIZED transition', async () => {
      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `valid-trans-1-${generateUUID()}`)
        .send({
          campaignId: campaignId,
          amount: 100,
        })
        .expect(201);

      const pledgeId = pledgeResponse.body.pledge._id;

      // Transition to AUTHORIZED via payment flow
      const intentResponse = await request(API_URL)
        .post('/api/payments/intent')
        .send({ pledgeId, amount: 100 });

      await request(API_URL)
        .post('/api/payments/authorize')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(3000);

      const verifyResponse = await request(API_URL)
        .get(`/api/pledges/${pledgeId}`)
        .expect(200);

      expect(verifyResponse.body.pledge.status).toBe('AUTHORIZED');
      expect(verifyResponse.body.pledge.stateHistory).toBeDefined();
      expect(verifyResponse.body.pledge.stateHistory.length).toBeGreaterThan(0);
    });

    it('should allow AUTHORIZED → CAPTURED transition', async () => {
      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `valid-trans-2-${generateUUID()}`)
        .send({
          campaignId: campaignId,
          amount: 150,
        });

      const pledgeId = pledgeResponse.body.pledge._id;

      // Go through authorization
      const intentResponse = await request(API_URL)
        .post('/api/payments/intent')
        .send({ pledgeId, amount: 150 });

      await request(API_URL)
        .post('/api/payments/authorize')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(3000);

      // Now capture
      await request(API_URL)
        .post('/api/payments/capture')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(2000);

      const verifyResponse = await request(API_URL)
        .get(`/api/pledges/${pledgeId}`)
        .expect(200);

      expect(verifyResponse.body.pledge.status).toBe('CAPTURED');
    });

    it('should allow PENDING → FAILED transition', async () => {
      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `valid-trans-3-${generateUUID()}`)
        .send({
          campaignId: campaignId,
          amount: 75,
        });

      const pledgeId = pledgeResponse.body.pledge._id;

      // Simulate failure via internal API
      const response = await request(API_URL)
        .patch(`/api/pledges/internal/${pledgeId}/status`)
        .send({ newStatus: 'FAILED' })
        .expect(200);

      expect(response.body.pledge.status).toBe('FAILED');
    });

    it('should allow AUTHORIZED → FAILED transition', async () => {
      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `valid-trans-4-${generateUUID()}`)
        .send({
          campaignId: campaignId,
          amount: 125,
        });

      const pledgeId = pledgeResponse.body.pledge._id;

      // Authorize first
      const intentResponse = await request(API_URL)
        .post('/api/payments/intent')
        .send({ pledgeId, amount: 125 });

      await request(API_URL)
        .post('/api/payments/authorize')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(3000);

      // Now fail it
      const response = await request(API_URL)
        .patch(`/api/pledges/internal/${pledgeId}/status`)
        .send({ newStatus: 'FAILED' })
        .expect(200);

      expect(response.body.pledge.status).toBe('FAILED');
    });
  });

  describe('Invalid State Transitions', () => {
    it('should reject PENDING → CAPTURED (must go through AUTHORIZED)', async () => {
      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `invalid-trans-1-${generateUUID()}`)
        .send({
          campaignId: campaignId,
          amount: 200,
        });

      const pledgeId = pledgeResponse.body.pledge._id;

      // Try to go directly to CAPTURED
      const response = await request(API_URL)
        .patch(`/api/pledges/internal/${pledgeId}/status`)
        .send({ newStatus: 'CAPTURED' })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('Invalid');
    });

    it('should reject AUTHORIZED → COMPLETED (must go through CAPTURED)', async () => {
      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `invalid-trans-2-${generateUUID()}`)
        .send({
          campaignId: campaignId,
          amount: 180,
        });

      const pledgeId = pledgeResponse.body.pledge._id;

      // Authorize
      const intentResponse = await request(API_URL)
        .post('/api/payments/intent')
        .send({ pledgeId, amount: 180 });

      await request(API_URL)
        .post('/api/payments/authorize')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(3000);

      // Try to go directly to COMPLETED
      const response = await request(API_URL)
        .patch(`/api/pledges/internal/${pledgeId}/status`)
        .send({ newStatus: 'COMPLETED' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should reject COMPLETED → AUTHORIZED (no transition from COMPLETED)', async () => {
      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `invalid-trans-3-${generateUUID()}`)
        .send({
          campaignId: campaignId,
          amount: 250,
        });

      const pledgeId = pledgeResponse.body.pledge._id;

      // Go through full flow to COMPLETED
      const intentResponse = await request(API_URL)
        .post('/api/payments/intent')
        .send({ pledgeId, amount: 250 });

      await request(API_URL)
        .post('/api/payments/authorize')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(3000);

      await request(API_URL)
        .post('/api/payments/capture')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(2000);

      // Manually set to COMPLETED (if this endpoint exists)
      await request(API_URL)
        .patch(`/api/pledges/internal/${pledgeId}/status`)
        .send({ newStatus: 'COMPLETED' });

      // Try to go back to AUTHORIZED
      const response = await request(API_URL)
        .patch(`/api/pledges/internal/${pledgeId}/status`)
        .send({ newStatus: 'AUTHORIZED' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should reject FAILED → any other status (terminal state)', async () => {
      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `invalid-trans-4-${generateUUID()}`)
        .send({
          campaignId: campaignId,
          amount: 90,
        });

      const pledgeId = pledgeResponse.body.pledge._id;

      // Fail it
      await request(API_URL)
        .patch(`/api/pledges/internal/${pledgeId}/status`)
        .send({ newStatus: 'FAILED' })
        .expect(200);

      // Try to transition to AUTHORIZED
      const response = await request(API_URL)
        .patch(`/api/pledges/internal/${pledgeId}/status`)
        .send({ newStatus: 'AUTHORIZED' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('State History Tracking', () => {
    it('should record all state transitions in stateHistory', async () => {
      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `history-test-${generateUUID()}`)
        .send({
          campaignId: campaignId,
          amount: 300,
        });

      const pledgeId = pledgeResponse.body.pledge._id;

      // Go through full flow
      const intentResponse = await request(API_URL)
        .post('/api/payments/intent')
        .send({ pledgeId, amount: 300 });

      await request(API_URL)
        .post('/api/payments/authorize')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(3000);

      await request(API_URL)
        .post('/api/payments/capture')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(2000);

      // Check state history
      const verifyResponse = await request(API_URL)
        .get(`/api/pledges/${pledgeId}`)
        .expect(200);

      const stateHistory = verifyResponse.body.pledge.stateHistory;

      expect(stateHistory).toBeDefined();
      expect(Array.isArray(stateHistory)).toBe(true);
      expect(stateHistory.length).toBeGreaterThanOrEqual(2); // At least PENDING→AUTHORIZED→CAPTURED

      // Verify each transition has required fields
      stateHistory.forEach((transition) => {
        expect(transition).toHaveProperty('from');
        expect(transition).toHaveProperty('to');
        expect(transition).toHaveProperty('timestamp');
      });

      // Verify transition sequence
      const transitions = stateHistory.map((t) => `${t.from}→${t.to}`);
      expect(transitions).toContain('PENDING→AUTHORIZED');
      expect(transitions).toContain('AUTHORIZED→CAPTURED');
    });

    it('should include timestamps for each transition', async () => {
      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `timestamp-test-${generateUUID()}`)
        .send({
          campaignId: campaignId,
          amount: 175,
        });

      const pledgeId = pledgeResponse.body.pledge._id;

      // Authorize
      const intentResponse = await request(API_URL)
        .post('/api/payments/intent')
        .send({ pledgeId, amount: 175 });

      await request(API_URL)
        .post('/api/payments/authorize')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(3000);

      const verifyResponse = await request(API_URL)
        .get(`/api/pledges/${pledgeId}`)
        .expect(200);

      const stateHistory = verifyResponse.body.pledge.stateHistory;

      // Verify timestamps are valid dates
      stateHistory.forEach((transition) => {
        const timestamp = new Date(transition.timestamp);
        expect(timestamp.toString()).not.toBe('Invalid Date');
        expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
      });

      // Verify timestamps are in chronological order
      for (let i = 1; i < stateHistory.length; i++) {
        const prevTime = new Date(stateHistory[i - 1].timestamp).getTime();
        const currTime = new Date(stateHistory[i].timestamp).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });
  });
});
