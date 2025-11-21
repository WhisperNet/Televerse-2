// End-to-End Donation Flow Integration Tests
const request = require('supertest');
const { TEST_CONFIG, cleanTestData, sleep, generateUUID } = require('./setup');

const API_URL = TEST_CONFIG.API_BASE_URL;

describe('End-to-End Donation Flow', () => {
  let authToken;
  let userId;
  let campaignId;
  let pledgeId;
  let paymentIntentId;

  beforeAll(async () => {
    // Clean test data
    await cleanTestData();
  });

  describe('Complete Donation Flow', () => {
    it('should create a user via identity service', async () => {
      const response = await request(API_URL)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: `test-${Date.now()}@example.com`,
          password: 'test123456',
        })
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email');

      authToken = response.body.token;
      userId = response.body.user._id || response.body.user.id;
    });

    it('should create a campaign', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 30);

      const response = await request(API_URL)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Medical Campaign',
          description: 'This is a test campaign for integration testing',
          goalAmount: 10000,
          category: 'Medical',
          endDate: tomorrow.toISOString(),
        })
        .expect(201);

      expect(response.body).toHaveProperty('_id');
      expect(response.body.title).toBe('Test Medical Campaign');
      expect(response.body.goalAmount).toBe(10000);

      campaignId = response.body._id;
    });

    it('should create a pledge with idempotency key', async () => {
      const idempotencyKey = `test-pledge-${generateUUID()}`;

      const response = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaignId: campaignId,
          amount: 250,
        })
        .expect(201);

      expect(response.body).toHaveProperty('pledge');
      expect(response.body.pledge).toHaveProperty('_id');
      expect(response.body.pledge.amount).toBe(250);
      expect(response.body.pledge.status).toBe('PENDING');
      expect(response.body.pledge.campaignId).toBe(campaignId);

      pledgeId = response.body.pledge._id;
    });

    it('should create payment intent', async () => {
      const response = await request(API_URL)
        .post('/api/payments/intent')
        .send({
          pledgeId: pledgeId,
          amount: 250,
        })
        .expect(201);

      expect(response.body).toHaveProperty('paymentIntentId');
      expect(response.body).toHaveProperty('status');

      paymentIntentId = response.body.paymentIntentId;
    });

    it('should authorize payment', async () => {
      const response = await request(API_URL)
        .post('/api/payments/authorize')
        .send({
          paymentIntentId: paymentIntentId,
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });

    it('should verify pledge status changed to AUTHORIZED after webhook', async () => {
      // Wait for webhook to process (2s + buffer)
      await sleep(3000);

      const response = await request(API_URL)
        .get(`/api/pledges/${pledgeId}`)
        .expect(200);

      expect(response.body.pledge.status).toBe('AUTHORIZED');
      expect(response.body.pledge.stateHistory).toBeDefined();
      expect(response.body.pledge.stateHistory.length).toBeGreaterThan(0);
    });

    it('should capture payment', async () => {
      const response = await request(API_URL)
        .post('/api/payments/capture')
        .send({
          paymentIntentId: paymentIntentId,
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });

    it('should verify pledge status changed to CAPTURED after webhook', async () => {
      // Wait for webhook to process (1s + buffer)
      await sleep(2000);

      const response = await request(API_URL)
        .get(`/api/pledges/${pledgeId}`)
        .expect(200);

      expect(response.body.pledge.status).toBe('CAPTURED');
    });

    it('should verify totals updated correctly after outbox worker processes event', async () => {
      // Wait for outbox worker to process (5s polling + buffer)
      await sleep(8000);

      const response = await request(API_URL)
        .get(`/api/totals/${campaignId}`)
        .expect(200);

      expect(response.body.campaignId).toBe(campaignId);
      expect(response.body.totalAmount).toBe(250);
      expect(response.body.totalPledges).toBe(1);
    });

    it('should verify campaign details are accessible', async () => {
      const response = await request(API_URL)
        .get(`/api/campaigns/${campaignId}`)
        .expect(200);

      expect(response.body._id).toBe(campaignId);
      expect(response.body.title).toBe('Test Medical Campaign');
    });
  });

  describe('Anonymous Donation Flow', () => {
    let anonymousSessionId;
    let anonPledgeId;
    let anonPaymentIntentId;

    it('should create anonymous session', async () => {
      const response = await request(API_URL)
        .post('/api/auth/anonymous-session')
        .send({})
        .expect(201);

      expect(response.body).toHaveProperty('sessionId');
      anonymousSessionId = response.body.sessionId;
    });

    it('should create pledge as anonymous user', async () => {
      const idempotencyKey = `test-anon-pledge-${generateUUID()}`;

      const response = await request(API_URL)
        .post('/api/pledges')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaignId: campaignId,
          amount: 150,
          sessionId: anonymousSessionId,
        })
        .expect(201);

      expect(response.body.pledge).toHaveProperty('_id');
      expect(response.body.pledge.amount).toBe(150);
      expect(response.body.pledge.sessionId).toBe(anonymousSessionId);

      anonPledgeId = response.body.pledge._id;
    });

    it('should complete payment flow for anonymous pledge', async () => {
      // Create payment intent
      let response = await request(API_URL)
        .post('/api/payments/intent')
        .send({
          pledgeId: anonPledgeId,
          amount: 150,
        })
        .expect(201);

      anonPaymentIntentId = response.body.paymentIntentId;

      // Authorize
      await request(API_URL)
        .post('/api/payments/authorize')
        .send({ paymentIntentId: anonPaymentIntentId })
        .expect(200);

      await sleep(3000);

      // Capture
      await request(API_URL)
        .post('/api/payments/capture')
        .send({ paymentIntentId: anonPaymentIntentId })
        .expect(200);

      await sleep(2000);

      // Verify captured
      response = await request(API_URL)
        .get(`/api/pledges/${anonPledgeId}`)
        .expect(200);

      expect(response.body.pledge.status).toBe('CAPTURED');
    });

    it('should see updated totals including anonymous pledge', async () => {
      // Wait for outbox worker
      await sleep(8000);

      const response = await request(API_URL)
        .get(`/api/totals/${campaignId}`)
        .expect(200);

      // Should now have 250 + 150 = 400
      expect(response.body.totalAmount).toBe(400);
      expect(response.body.totalPledges).toBe(2);
    });
  });
});
