const mongoose = require('mongoose');

const campaignTotalSchema = new mongoose.Schema({
  campaignId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  totalAmount: {
    type: Number,
    default: 0,
  },
  totalPledges: {
    type: Number,
    default: 0,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('CampaignTotal', campaignTotalSchema);
