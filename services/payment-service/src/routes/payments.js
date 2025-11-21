const express = require('express');
const axios = require('axios');
const PaymentTransaction = require('../models/PaymentTransaction');
const WebhookLog = require('../models/WebhookLog');
const { mongoose } = require('/usr/src/app/shared/utils/mongodb');
const mockProvider = require('../services/mockPaymentProvider');
const { webhooksProcessedTotal } = require('../metrics');

const router = express.Router();

// Helper to map event type to status
function mapEventToStatus(eventType) {
  const mapping = {
    'payment.authorized': 'authorized',
    'payment.captured': 'captured',
    'payment.failed': 'failed',
  };
  return mapping[eventType] || 'pending';
}

// POST /payments/intent - Create payment intent
router.post('/intent', async (req, res) => {
  try {
    const { pledgeId, amount } = req.body;

    if (!pledgeId || !amount) {
      return res
        .status(400)
        .json({ error: 'pledgeId and amount are required' });
    }

    // Create payment intent with mock provider
    const intent = mockProvider.createPaymentIntent(amount);

    // Store transaction
    const transaction = await PaymentTransaction.create({
      pledgeId,
      paymentIntentId: intent.id,
      amount,
      status: 'pending',
    });

    console.log(
      `[payments] Created payment intent ${intent.id} for pledge ${pledgeId}`
    );

    res.status(201).json({
      message: 'Payment intent created',
      paymentIntentId: intent.id,
      status: intent.status,
      transaction,
    });
  } catch (error) {
    console.error('[payments/intent] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /payments/authorize - Authorize payment
router.post('/authorize', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'paymentIntentId is required' });
    }

    // Find transaction
    const transaction = await PaymentTransaction.findOne({ paymentIntentId });
    if (!transaction) {
      return res.status(404).json({ error: 'Payment transaction not found' });
    }

    // Trigger authorization (webhook will fire in 2s)
    const webhookUrl =
      process.env.WEBHOOK_URL ||
      'http://payment-service:3004/payments/webhooks';
    mockProvider.authorizePayment(
      paymentIntentId,
      webhookUrl,
      transaction.pledgeId
    );

    console.log(`[payments] Authorization initiated for ${paymentIntentId}`);

    res.status(202).json({
      message: 'Payment authorization initiated',
      paymentIntentId,
    });
  } catch (error) {
    console.error('[payments/authorize] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /payments/capture - Capture payment
router.post('/capture', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'paymentIntentId is required' });
    }

    // Find transaction
    const transaction = await PaymentTransaction.findOne({ paymentIntentId });
    if (!transaction) {
      return res.status(404).json({ error: 'Payment transaction not found' });
    }

    // Trigger capture (webhook will fire in 1s)
    const webhookUrl =
      process.env.WEBHOOK_URL ||
      'http://payment-service:3004/payments/webhooks';
    mockProvider.capturePayment(
      paymentIntentId,
      webhookUrl,
      transaction.pledgeId
    );

    console.log(`[payments] Capture initiated for ${paymentIntentId}`);

    res.status(202).json({
      message: 'Payment capture initiated',
      paymentIntentId,
    });
  } catch (error) {
    console.error('[payments/capture] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /payments/webhooks - Webhook handler (CRITICAL - with idempotency)
router.post('/webhooks', async (req, res) => {
  try {
    const { id: webhookId, type: eventType, data } = req.body;

    console.log(`[webhooks] Received webhook ${webhookId} (${eventType})`);

    if (!webhookId || !eventType || !data) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Idempotency check
    const existing = await WebhookLog.findOne({ webhookId });
    if (existing && existing.processed) {
      console.log(
        `[webhooks] Webhook ${webhookId} already processed (idempotent)`
      );
      webhooksProcessedTotal.inc({
        event_type: eventType,
        status: 'duplicate',
      });
      return res.status(200).json({ message: 'Already processed' });
    }

    // Start transaction
    const session = await mongoose.startSession();
    await session.startTransaction();

    try {
      // Find payment transaction
      const transaction = await PaymentTransaction.findOne({
        paymentIntentId: data.paymentIntentId,
      }).session(session);

      if (!transaction) {
        await session.abortTransaction();
        return res.status(404).json({ error: 'Payment transaction not found' });
      }

      // Log webhook
      await WebhookLog.create(
        [
          {
            webhookId,
            eventType,
            pledgeId: data.pledgeId,
            payload: data,
            processed: true,
            processedAt: new Date(),
          },
        ],
        { session }
      );

      // Update payment transaction status
      const newStatus = mapEventToStatus(eventType);
      transaction.status = newStatus;
      await transaction.save({ session });

      await session.commitTransaction();
      console.log(
        `[webhooks] Webhook ${webhookId} processed, payment ${transaction.paymentIntentId} → ${newStatus}`
      );

      // Update pledge status (call internal API)
      try {
        const pledgeStatus = newStatus.toUpperCase();
        await axios.patch(
          `http://pledge-service:3003/pledges/internal/${data.pledgeId}/status`,
          { newStatus: pledgeStatus }
        );
        console.log(
          `[webhooks] Updated pledge ${data.pledgeId} status to ${pledgeStatus}`
        );
      } catch (error) {
        console.error(
          '[webhooks] Failed to update pledge status:',
          error.message
        );
        // Don't fail the webhook processing if pledge update fails
      }

      webhooksProcessedTotal.inc({ event_type: eventType, status: 'success' });

      res.status(200).json({
        message: 'Webhook processed successfully',
        webhookId,
        paymentIntentId: data.paymentIntentId,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('[webhooks] Error:', error);
    webhooksProcessedTotal.inc({
      event_type: req.body.type || 'unknown',
      status: 'error',
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
