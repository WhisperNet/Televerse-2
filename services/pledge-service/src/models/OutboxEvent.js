const mongoose = require('mongoose');

const outboxEventSchema = new mongoose.Schema({
  aggregateId: {
    type: String,
    required: true,
  },
  eventType: {
    type: String,
    required: true,
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'published', 'failed'],
    default: 'pending',
  },
  retryCount: {
    type: Number,
    default: 0,
    max: 5,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for efficient worker queries
outboxEventSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('OutboxEvent', outboxEventSchema);
