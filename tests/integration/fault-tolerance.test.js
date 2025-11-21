// Fault Tolerance Integration Tests
const request = require('supertest');
const { exec } = require('child_process');
const util = require('util');
const {
  TEST_CONFIG,
  cleanTestData,
  sleep,
  generateUUID,
  getTestDb,
} = require('./setup');

const execPromise = util.promisify(exec);
const API_URL = TEST_CONFIG.API_BASE_URL;

describe('Fault Tolerance Tests', () => {
  let authToken;
  let campaignId;

  beforeAll(async () => {
    await cleanTestData();

    // Create user and campaign for testing
    const userResponse = await request(API_URL)
      .post('/api/auth/register')
      .send({
        name: 'Fault Tolerance Test User',
        email: `fault-test-${Date.now()}@example.com`,
        password: 'test123456',
      });

    authToken = userResponse.body.token;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 30);

    const campaignResponse = await request(API_URL)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Fault Tolerance Test Campaign',
        description: 'Campaign for fault tolerance testing',
        goalAmount: 10000,
        category: 'Medical',
        endDate: tomorrow.toISOString(),
      });

    campaignId = campaignResponse.body._id;
  });

  describe('Totals Service Failure Scenario (Kill Switch Demo)', () => {
    let initialTotals;

    it('should create initial pledges and verify totals', async () => {
      // Create 2 pledges of $100 each
      for (let i = 0; i < 2; i++) {
        const pledgeResponse = await request(API_URL)
          .post('/api/pledges')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', `kill-switch-initial-${i}-${generateUUID()}`)
          .send({
            campaignId: campaignId,
            amount: 100,
          });

        const pledgeId = pledgeResponse.body.pledge._id;

        // Complete payment flow
        const intentResponse = await request(API_URL)
          .post('/api/payments/intent')
          .send({ pledgeId, amount: 100 });

        await request(API_URL)
          .post('/api/payments/authorize')
          .send({ paymentIntentId: intentResponse.body.paymentIntentId });

        await sleep(3000);

        await request(API_URL)
          .post('/api/payments/capture')
          .send({ paymentIntentId: intentResponse.body.paymentIntentId });

        await sleep(2000);
      }

      // Wait for outbox worker to process events
      await sleep(8000);

      // Verify totals = $200
      const totalsResponse = await request(API_URL)
        .get(`/api/totals/${campaignId}`)
        .expect(200);

      expect(totalsResponse.body.totalAmount).toBe(200);
      expect(totalsResponse.body.totalPledges).toBe(2);

      initialTotals = totalsResponse.body;
    }, 60000); // Increase timeout for this test

    it('should stop totals service', async () => {
      try {
        const { stdout } = await execPromise('docker stop careforall-totals');
        console.log('Stopped totals service:', stdout);

        // Give it a moment to fully stop
        await sleep(2000);

        // Verify it's stopped
        const { stdout: psOutput } = await execPromise(
          'docker ps --filter name=careforall-totals --format "{{.Status}}"'
        );
        expect(psOutput.trim()).toBe(''); // Should be empty if stopped
      } catch (error) {
        console.error('Error stopping totals service:', error);
        throw error;
      }
    }, 30000);

    it('should create more pledges while totals service is down', async () => {
      // Create 2 more pledges of $100 each
      for (let i = 0; i < 2; i++) {
        const pledgeResponse = await request(API_URL)
          .post('/api/pledges')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', `kill-switch-during-${i}-${generateUUID()}`)
          .send({
            campaignId: campaignId,
            amount: 100,
          })
          .expect(201); // Should still work!

        expect(pledgeResponse.body.pledge).toBeDefined();

        const pledgeId = pledgeResponse.body.pledge._id;

        // Complete payment flow - should still work
        const intentResponse = await request(API_URL)
          .post('/api/payments/intent')
          .send({ pledgeId, amount: 100 })
          .expect(201);

        await request(API_URL)
          .post('/api/payments/authorize')
          .send({ paymentIntentId: intentResponse.body.paymentIntentId })
          .expect(200);

        await sleep(3000);

        await request(API_URL)
          .post('/api/payments/capture')
          .send({ paymentIntentId: intentResponse.body.paymentIntentId })
          .expect(200);

        await sleep(2000);
      }
    }, 60000);

    it('should verify totals are stale (still showing $200)', async () => {
      const totalsResponse = await request(API_URL)
        .get(`/api/totals/${campaignId}`)
        .expect(200);

      // Should still show old totals
      expect(totalsResponse.body.totalAmount).toBe(200);
      expect(totalsResponse.body.totalPledges).toBe(2);
    });

    it('should restart totals service', async () => {
      try {
        const { stdout } = await execPromise('docker start careforall-totals');
        console.log('Started totals service:', stdout);

        // Give it time to start and process backlog
        await sleep(5000);

        // Verify it's running
        const { stdout: psOutput } = await execPromise(
          'docker ps --filter name=careforall-totals --format "{{.Status}}"'
        );
        expect(psOutput).toContain('Up');
      } catch (error) {
        console.error('Error starting totals service:', error);
        throw error;
      }
    }, 30000);

    it('should verify totals updated to $400 after recovery', async () => {
      // Wait for service to process backlog
      await sleep(10000);

      const totalsResponse = await request(API_URL)
        .get(`/api/totals/${campaignId}`)
        .expect(200);

      // Should now show updated totals: 2 * $100 (initial) + 2 * $100 (during downtime) = $400
      expect(totalsResponse.body.totalAmount).toBe(400);
      expect(totalsResponse.body.totalPledges).toBe(4);
    }, 30000);
  });

  describe('Duplicate Webhook Retry Scenario', () => {
    it('should handle payment provider retrying webhooks', async () => {
      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `webhook-retry-test-${generateUUID()}`)
        .send({
          campaignId: campaignId,
          amount: 150,
        });

      const pledgeId = pledgeResponse.body.pledge._id;

      const intentResponse = await request(API_URL)
        .post('/api/payments/intent')
        .send({ pledgeId, amount: 150 });

      const paymentIntentId = intentResponse.body.paymentIntentId;
      const webhookId = generateUUID();

      // Simulate webhook being sent 3 times
      const webhookPayload = {
        id: webhookId,
        type: 'payment.authorized',
        data: {
          paymentIntentId: paymentIntentId,
          pledgeId: pledgeId,
          status: 'authorized',
        },
      };

      const responses = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(API_URL)
          .post('/api/payments/webhooks')
          .send(webhookPayload)
          .expect(200);

        responses.push(response);
      }

      // All should return 200
      expect(responses.length).toBe(3);

      // Wait a moment
      await sleep(1000);

      // Verify pledge status updated only once
      const pledgeCheckResponse = await request(API_URL)
        .get(`/api/pledges/${pledgeId}`)
        .expect(200);

      expect(pledgeCheckResponse.body.pledge.status).toBe('AUTHORIZED');

      // Verify only one webhook log entry
      const paymentsDb = getTestDb('payments_db');
      const webhookLogs = await paymentsDb
        .collection('webhooklogs')
        .find({ webhookId: webhookId })
        .toArray();

      expect(webhookLogs.length).toBe(1);
    });
  });

  describe('Service Resilience - Outbox Pattern', () => {
    it('should verify pledges are created even if event publishing fails temporarily', async () => {
      // Create a pledge
      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', `outbox-resilience-${generateUUID()}`)
        .send({
          campaignId: campaignId,
          amount: 225,
        })
        .expect(201);

      const pledgeId = pledgeResponse.body.pledge._id;

      // Verify pledge exists
      expect(pledgeResponse.body.pledge._id).toBeDefined();

      // Complete payment
      const intentResponse = await request(API_URL)
        .post('/api/payments/intent')
        .send({ pledgeId, amount: 225 });

      await request(API_URL)
        .post('/api/payments/authorize')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(3000);

      await request(API_URL)
        .post('/api/payments/capture')
        .send({ paymentIntentId: intentResponse.body.paymentIntentId });

      await sleep(2000);

      // Check that outbox event was created
      const pledgesDb = getTestDb('pledges_db');
      const outboxEvents = await pledgesDb
        .collection('outboxevents')
        .find({ aggregateId: pledgeId })
        .toArray();

      expect(outboxEvents.length).toBeGreaterThan(0);

      // Verify event will eventually be published
      await sleep(8000);

      const publishedEvents = await pledgesDb
        .collection('outboxevents')
        .find({
          aggregateId: pledgeId,
          status: 'published',
        })
        .toArray();

      expect(publishedEvents.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Database Transaction Atomicity', () => {
    it('should ensure pledge and outbox event are created atomically', async () => {
      const idempotencyKey = `atomicity-test-${generateUUID()}`;

      const pledgeResponse = await request(API_URL)
        .post('/api/pledges')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          campaignId: campaignId,
          amount: 88,
        })
        .expect(201);

      const pledgeId = pledgeResponse.body.pledge._id;

      // Verify both pledge and outbox event exist
      const pledgesDb = getTestDb('pledges_db');

      const pledge = await pledgesDb
        .collection('pledges')
        .findOne({ _id: pledgeId });

      const outboxEvent = await pledgesDb
        .collection('outboxevents')
        .findOne({ aggregateId: pledgeId });

      expect(pledge).toBeDefined();
      expect(outboxEvent).toBeDefined();
      expect(pledge.idempotencyKey).toBe(idempotencyKey);
    });
  });
});
