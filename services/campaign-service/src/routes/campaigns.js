const express = require('express');
const Campaign = require('../models/Campaign');
const { authenticateToken } = require('../middleware/auth');
const { publishEvent } = require('/usr/src/app/shared/utils/rabbitmq');
const { RoutingKeys } = require('/usr/src/app/shared/constants');

const router = express.Router();

// GET /campaigns - List all campaigns
router.get('/', async (req, res) => {
  try {
    const { status = 'active' } = req.query;
    const campaigns = await Campaign.find({ status }).sort({ createdAt: -1 });

    res.status(200).json({
      campaigns,
      count: campaigns.length,
    });
  } catch (error) {
    console.error('[campaigns/list] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /campaigns/:id - Get single campaign
router.get('/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.status(200).json({ campaign });
  } catch (error) {
    console.error('[campaigns/get] Error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /campaigns - Create campaign (JWT required)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, goalAmount, category, endDate } = req.body;

    // Validation
    if (!title || !description || !goalAmount || !category || !endDate) {
      return res.status(400).json({
        error:
          'title, description, goalAmount, category, and endDate are required',
      });
    }

    if (goalAmount <= 0) {
      return res.status(400).json({ error: 'goalAmount must be positive' });
    }

    // Create campaign
    const campaign = await Campaign.create({
      title,
      description,
      goalAmount,
      category,
      endDate: new Date(endDate),
      ownerId: req.user.userId,
      status: 'active',
    });

    // Publish event to RabbitMQ
    try {
      await publishEvent(RoutingKeys.CAMPAIGN_CREATED || 'campaign.created', {
        campaignId: campaign._id.toString(),
        ownerId: campaign.ownerId,
        title: campaign.title,
        goalAmount: campaign.goalAmount,
        createdAt: campaign.createdAt,
      });
      console.log('[campaigns/create] Published campaign.created event');
    } catch (eventError) {
      console.error('[campaigns/create] Failed to publish event:', eventError);
      // Don't fail the request if event publishing fails
    }

    res.status(201).json({
      message: 'Campaign created successfully',
      campaign,
    });
  } catch (error) {
    console.error('[campaigns/create] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
