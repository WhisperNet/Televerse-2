const mongoose = require('mongoose');

const paymentTransactionSchema = new mongoose.Schema({
  pledgeId: {
    type: String,
    required: true,
  },
  paymentIntentId: {
    type: String,
    required: true,
    unique: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'authorized', 'captured', 'failed'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);
