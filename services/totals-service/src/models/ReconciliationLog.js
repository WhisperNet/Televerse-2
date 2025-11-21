const mongoose = require('mongoose');

const reconciliationLogSchema = new mongoose.Schema({
  campaignId: {
    type: String,
    required: true,
  },
  pledgeId: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  operation: {
    type: String,
    enum: ['add', 'subtract'],
    required: true,
  },
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  processedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('ReconciliationLog', reconciliationLogSchema);
