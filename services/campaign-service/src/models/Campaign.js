const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  goalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  ownerId: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'completed'],
    default: 'active',
  },
  category: {
    type: String,
    required: true,
    trim: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Campaign', campaignSchema);
