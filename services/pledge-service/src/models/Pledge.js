const mongoose = require('mongoose');

const pledgeSchema = new mongoose.Schema({
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  campaignId: {
    type: String,
    required: true,
  },
  donorId: {
    type: String,
    default: null,
  },
  sessionId: {
    type: String,
    default: null,
  },
  amount: {
    type: Number,
    required: true,
    min: 1,
  },
  status: {
    type: String,
    enum: ['PENDING', 'AUTHORIZED', 'CAPTURED', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
  },
  stateHistory: {
    type: [
      {
        from: String,
        to: String,
        timestamp: Date,
      },
    ],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Pledge', pledgeSchema);
