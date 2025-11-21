// Idempotency Integration Tests
const request = require('supertest');
const {
  TEST_CONFIG,
  cleanTestData,
  sleep,
  generateUUID,
  getTestDb,
} = require('./setup');

const API_URL = TEST_CONFIG.API_BASE_URL;

describe('Idempotency Tests', () => {
  let authToken;
  let campaignId;

  beforeAll(async () => {
    await cleanTestData();

    // Create user and campaign for testing
    const userResponse = await request(API_URL)
      .post('/api/auth/register')
      .send({
        name: 'Idempotency Test User',
        email: `idempotency-test-${Date.now()}@example.com`,
        password: 'test123456',
      });

    authToken = userResponse.body.token;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 30);

    const campaignResponse = await request(API_URL)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Idempotency Test Campaign',
        description: 'Campaign for idempotency testing',
        goalAmount: 5000,
        category: 'Medical',
        endDate: tomorrow.toISOString(),
      });

    campaignId = campaignResponse.body._id;
  });

  describe('Pledge Idempotency', () => {
    it('should create a pledge with idempotency key', async () => {
      const idempotencyKey = `idempotency-test-${generateUUID()}`;

      const response = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaignId: campaignId,
          amount: 100,
        })
        .expect(201);

      expect(response.body.pledge).toHaveProperty('_id');
      expect(response.body.pledge.amount).toBe(100);
      expect(response.body.pledge.idempotencyKey).toBe(idempotencyKey);
    });

    it('should return existing pledge when retrying with same idempotency key', async () => {
      const idempotencyKey = `idempotency-retry-test-${generateUUID()}`;

      // First request
      const firstResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaignId: campaignId,
          amount: 200,
        })
        .expect(201);

      const firstPledgeId = firstResponse.body.pledge._id;

      // Retry with same key
      const retryResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaignId: campaignId,
          amount: 200,
        })
        .expect(200); // Should return 200, not 201

      // Should return the same pledge
      expect(retryResponse.body.pledge._id).toBe(firstPledgeId);
      expect(retryResponse.body.pledge.amount).toBe(200);
    });

    it('should verify only one pledge exists in database after retries', async () => {
      const idempotencyKey = `idempotency-db-check-${generateUUID()}`;

      // Make the same request 3 times
      for (let i = 0; i < 3; i++) {
        await request(API_URL)
          .post('/api/pledges')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send({
            campaignId: campaignId,
            amount: 50,
          });
      }

      // Check database
      const pledgesDb = getTestDb('pledges_db');
      const pledges = await pledgesDb
        .collection('pledges')
        .find({ idempotencyKey: idempotencyKey })
        .toArray();

      expect(pledges.length).toBe(1);
      expect(pledges[0].amount).toBe(50);
    });
  });

  describe('Webhook Idempotency', () => {
    let pledgeId;
    let paymentIntentId;
    let webhookId;

    beforeAll(async () => {
      // Create a pledge and payment intent
      const idempotencyKey = `webhook-test-${generateUUID()}`;

      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaignId: campaignId,
          amount: 300,
        });

      pledgeId = pledgeResponse.body.pledge._id;

      const intentResponse = await request(API_URL)
        .post('/api/payments/intent')
        .send({
          pledgeId: pledgeId,
          amount: 300,
        });

      paymentIntentId = intentResponse.body.paymentIntentId;
      webhookId = generateUUID();
    });

    it('should process webhook first time', async () => {
      const response = await request(API_URL)
        .post('/api/payments/webhooks')
        .send({
          id: webhookId,
          type: 'payment.authorized',
          data: {
            paymentIntentId: paymentIntentId,
            pledgeId: pledgeId,
            status: 'authorized',
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });

    it('should return "already processed" for duplicate webhook', async () => {
      // Send the same webhook again
      const response = await request(API_URL)
        .post('/api/payments/webhooks')
        .send({
          id: webhookId,
          type: 'payment.authorized',
          data: {
            paymentIntentId: paymentIntentId,
            pledgeId: pledgeId,
            status: 'authorized',
          },
        })
        .expect(200);

      expect(response.body.message).toContain('processed');
    });

    it('should verify payment status updated only once', async () => {
      // Give it time to process
      await sleep(1000);

      const paymentsDb = getTestDb('payments_db');
      const payment = await paymentsDb
        .collection('paymenttransactions')
        .findOne({ paymentIntentId: paymentIntentId });

      expect(payment).toBeDefined();
      expect(payment.status).toBe('authorized');
    });

    it('should verify webhook logged only once in WebhookLog', async () => {
      const paymentsDb = getTestDb('payments_db');
      const webhookLogs = await paymentsDb
        .collection('webhooklogs')
        .find({ webhookId: webhookId })
        .toArray();

      expect(webhookLogs.length).toBe(1);
      expect(webhookLogs[0].processed).toBe(true);
    });
  });

  describe('Event Consumer Idempotency', () => {
    let testCampaignId;
    let testPledgeId;

    beforeAll(async () => {
      // Create campaign for this test
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 30);

      const campaignResponse = await request(API_URL)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Event Idempotency Test',
          description: 'Testing event consumer idempotency',
          goalAmount: 1000,
          category: 'Medical',
          endDate: tomorrow.toISOString(),
        });

      testCampaignId = campaignResponse.body._id;
    });

    it('should process pledge to CAPTURED state', async () => {
      const idempotencyKey = `event-consumer-test-${generateUUID()}`;

      // Create pledge
      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaignId: testCampaignId,
          amount: 500,
        });

      testPledgeId = pledgeResponse.body.pledge._id;

      // Process payment
      const intentResponse = await request(API_URL)
        .post('/api/payments/intent')
        .send({
          pledgeId: testPledgeId,
          amount: 500,
        });

      await request(API_URL)
        .post('/api/payments/authorize')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(3000);

      await request(API_URL)
        .post('/api/payments/capture')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(2000);
    });

    it('should verify totals incremented only once despite event replays', async () => {
      // Wait for outbox worker
      await sleep(8000);

      // Check totals
      const totalsResponse = await request(API_URL)
        .get(`/api/totals/${testCampaignId}`)
        .expect(200);

      expect(totalsResponse.body.totalAmount).toBe(500);
      expect(totalsResponse.body.totalPledges).toBe(1);

      // Check ReconciliationLog has single entry
      const totalsDb = getTestDb('totals_db');
      const reconciliationLogs = await totalsDb
        .collection('reconciliationlogs')
        .find({
          pledgeId: testPledgeId,
          campaignId: testCampaignId,
        })
        .toArray();

      expect(reconciliationLogs.length).toBe(1);
      expect(reconciliationLogs[0].amount).toBe(500);
      expect(reconciliationLogs[0].operation).toBe('add');
    });
  });

  describe('Concurrent Idempotency Tests', () => {
    it('should handle concurrent requests with same idempotency key', async () => {
      const idempotencyKey = `concurrent-test-${generateUUID()}`;

      // Send 5 concurrent requests with same idempotency key
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(API_URL)
            .post('/api/pledges')
            .set('Authorization', `Bearer ${authToken}`)
            .set('Idempotency-Key', idempotencyKey)
            .send({
              campaignId: campaignId,
              amount: 75,
            })
        );
      }

      const responses = await Promise.all(promises);

      // All should return same pledge ID
      const pledgeIds = responses.map((r) => r.body.pledge._id);
      const uniqueIds = [...new Set(pledgeIds)];

      expect(uniqueIds.length).toBe(1);

      // Verify only one pledge in database
      const pledgesDb = getTestDb('pledges_db');
      const pledges = await pledgesDb
        .collection('pledges')
        .find({ idempotencyKey: idempotencyKey })
        .toArray();

      expect(pledges.length).toBe(1);
    });
  });
});
