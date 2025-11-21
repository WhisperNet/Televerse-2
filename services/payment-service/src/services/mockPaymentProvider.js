const { v4: uuid } = require('uuid');
const axios = require('axios');

// In-memory store for payment intents
const intents = new Map();

function createPaymentIntent(amount) {
  const id = uuid();
  intents.set(id, { amount, status: 'pending' });
  console.log(
    `[mock-provider] Created payment intent ${id} for amount ${amount}`
  );
  return { id, status: 'pending', amount };
}

async function authorizePayment(intentId, webhookUrl, pledgeId) {
  console.log(
    `[mock-provider] Authorizing payment ${intentId}, webhook will fire in 2s`
  );

  setTimeout(async () => {
    const webhookId = uuid();
    try {
      await axios.post(webhookUrl, {
        id: webhookId,
        type: 'payment.authorized',
        data: {
          paymentIntentId: intentId,
          pledgeId,
        },
      });
      console.log(`[mock-provider] Sent authorized webhook ${webhookId}`);
    } catch (error) {
      console.error(
        '[mock-provider] Failed to send authorized webhook:',
        error.message
      );
    }
  }, 2000); // 2 second delay
}

async function capturePayment(intentId, webhookUrl, pledgeId) {
  console.log(
    `[mock-provider] Capturing payment ${intentId}, webhook will fire in 1s`
  );

  setTimeout(async () => {
    const webhookId = uuid();
    try {
      await axios.post(webhookUrl, {
        id: webhookId,
        type: 'payment.captured',
        data: {
          paymentIntentId: intentId,
          pledgeId,
        },
      });
      console.log(`[mock-provider] Sent captured webhook ${webhookId}`);
    } catch (error) {
      console.error(
        '[mock-provider] Failed to send captured webhook:',
        error.message
      );
    }
  }, 1000); // 1 second delay
}

module.exports = {
  createPaymentIntent,
  authorizePayment,
  capturePayment,
};
