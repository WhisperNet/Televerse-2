const express = require('express');
const CampaignTotal = require('../models/CampaignTotal');

const router = express.Router();

// GET /totals/:campaignId - Get pre-calculated totals (fast read)
router.get('/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;

    const total = await CampaignTotal.findOne({ campaignId });

    if (!total) {
      return res.status(200).json({
        campaignId,
        totalAmount: 0,
        totalPledges: 0,
        lastUpdated: null,
      });
    }

    res.status(200).json({
      campaignId: total.campaignId,
      totalAmount: total.totalAmount,
      totalPledges: total.totalPledges,
      lastUpdated: total.lastUpdated,
    });
  } catch (error) {
    console.error('[totals/get] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
