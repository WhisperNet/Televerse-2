const express = require('express');
const axios = require('axios');
const Pledge = require('../models/Pledge');
const OutboxEvent = require('../models/OutboxEvent');
const { canTransition, recordTransition } = require('../utils/stateMachine');
const { mongoose } = require('/usr/src/app/shared/utils/mongodb');

const router = express.Router();

// POST /pledges - Create pledge with idempotency
router.post('/', async (req, res) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    const { campaignId, amount, donorId, sessionId } = req.body;

    // Validate idempotency key
    if (!idempotencyKey) {
      return res
        .status(400)
        .json({ error: 'Idempotency-Key header is required' });
    }

    // Validate required fields
    if (!campaignId || !amount) {
      return res
        .status(400)
        .json({ error: 'campaignId and amount are required' });
    }

    if (!donorId && !sessionId) {
      return res
        .status(400)
        .json({ error: 'Either donorId or sessionId is required' });
    }

    // Validate campaign exists
    try {
      await axios.get(`http://campaign-service:3002/campaigns/${campaignId}`);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      throw error;
    }

    // Check if pledge already exists (idempotency)
    const existing = await Pledge.findOne({ idempotencyKey });
    if (existing) {
      console.log(
        `[pledges] Returning existing pledge for key: ${idempotencyKey}`
      );
      return res.status(200).json({
        message: 'Pledge already exists',
        pledge: existing,
      });
    }

    // Start MongoDB transaction
    const session = await mongoose.startSession();
    await session.startTransaction();

    try {
      // Create pledge
      const pledge = await Pledge.create(
        [
          {
            idempotencyKey,
            campaignId,
            amount,
            donorId: donorId || null,
            sessionId: sessionId || null,
            status: 'PENDING',
            stateHistory: [],
          },
        ],
        { session }
      );

      // Create outbox event
      await OutboxEvent.create(
        [
          {
            aggregateId: pledge[0]._id.toString(),
            eventType: 'pledge.created',
            payload: {
              pledgeId: pledge[0]._id.toString(),
              campaignId: pledge[0].campaignId,
              amount: pledge[0].amount,
              donorId: pledge[0].donorId,
              sessionId: pledge[0].sessionId,
              status: pledge[0].status,
            },
            status: 'pending',
          },
        ],
        { session }
      );

      await session.commitTransaction();
      console.log(
        `[pledges] Created pledge ${pledge[0]._id} with outbox event`
      );

      res.status(201).json({
        message: 'Pledge created successfully',
        pledge: pledge[0],
      });
    } catch (error) {
      await session.abortTransaction();

      // Handle duplicate key error
      if (error.code === 11000) {
        const existing = await Pledge.findOne({ idempotencyKey });
        return res.status(200).json({
          message: 'Pledge already exists',
          pledge: existing,
        });
      }

      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('[pledges/create] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /pledges/:id - Get pledge details
router.get('/:id', async (req, res) => {
  try {
    const pledge = await Pledge.findById(req.params.id);

    if (!pledge) {
      return res.status(404).json({ error: 'Pledge not found' });
    }

    res.status(200).json({ pledge });
  } catch (error) {
    console.error('[pledges/get] Error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid pledge ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /internal/pledges/:id/status - Internal endpoint for Payment Service
router.patch('/internal/:id/status', async (req, res) => {
  try {
    const { newStatus } = req.body;

    if (!newStatus) {
      return res.status(400).json({ error: 'newStatus is required' });
    }

    const pledge = await Pledge.findById(req.params.id);
    if (!pledge) {
      return res.status(404).json({ error: 'Pledge not found' });
    }

    // Validate state transition
    if (!canTransition(pledge.status, newStatus)) {
      return res.status(400).json({
        error: `Invalid state transition from ${pledge.status} to ${newStatus}`,
      });
    }

    // Start transaction
    const session = await mongoose.startSession();
    await session.startTransaction();

    try {
      // Update pledge
      const oldStatus = pledge.status;
      pledge.status = newStatus;
      pledge.stateHistory = recordTransition(
        pledge.stateHistory,
        oldStatus,
        newStatus
      );
      await pledge.save({ session });

      // Create outbox event for status change
      if (newStatus === 'CAPTURED') {
        await OutboxEvent.create(
          [
            {
              aggregateId: pledge._id.toString(),
              eventType: 'pledge.captured',
              payload: {
                pledgeId: pledge._id.toString(),
                campaignId: pledge.campaignId,
                amount: pledge.amount,
                status: newStatus,
              },
              status: 'pending',
            },
          ],
          { session }
        );
      }

      await session.commitTransaction();
      console.log(
        `[pledges] Updated pledge ${pledge._id}: ${oldStatus} → ${newStatus}`
      );

      res.status(200).json({
        message: 'Pledge status updated',
        pledge,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('[pledges/update-status] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
