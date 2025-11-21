const mongoose = require('mongoose');

const webhookLogSchema = new mongoose.Schema({
  webhookId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  eventType: {
    type: String,
    required: true,
  },
  pledgeId: {
    type: String,
    required: true,
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  processed: {
    type: Boolean,
    default: true,
  },
  processedAt: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('WebhookLog', webhookLogSchema);
