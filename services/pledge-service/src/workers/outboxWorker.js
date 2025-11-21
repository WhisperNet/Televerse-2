const OutboxEvent = require('../models/OutboxEvent');
const { publishEvent } = require('/usr/src/app/shared/utils/rabbitmq');
const { outboxPendingTotal } = require('../metrics');

const POLL_INTERVAL = 5000; // 5 seconds
const MAX_RETRIES = 5;

async function processOutbox() {
  try {
    // Find pending events
    const pending = await OutboxEvent.find({
      status: 'pending',
      retryCount: { $lt: MAX_RETRIES },
    }).limit(50);

    console.log(`[outbox-worker] Processing ${pending.length} pending events`);

    for (const event of pending) {
      try {
        // Publish to RabbitMQ
        await publishEvent(event.eventType, event.payload);

        // Mark as published
        event.status = 'published';
        await event.save();

        console.log(
          `[outbox-worker] Published event ${event._id} (${event.eventType})`
        );
      } catch (error) {
        console.error(
          `[outbox-worker] Failed to publish event ${event._id}:`,
          error.message
        );

        // Increment retry count
        event.retryCount += 1;

        // Mark as failed if max retries reached
        if (event.retryCount >= MAX_RETRIES) {
          event.status = 'failed';
          console.error(
            `[outbox-worker] Event ${event._id} marked as failed after ${MAX_RETRIES} retries`
          );
        }

        await event.save();
      }
    }

    // Update metrics
    const pendingCount = await OutboxEvent.countDocuments({
      status: 'pending',
    });
    outboxPendingTotal.set(pendingCount);
  } catch (error) {
    console.error('[outbox-worker] Error processing outbox:', error);
  }
}

function startWorker() {
  console.log(
    `[outbox-worker] Starting worker (polling every ${POLL_INTERVAL}ms)`
  );
  setInterval(processOutbox, POLL_INTERVAL);

  // Process immediately on start
  processOutbox();
}

module.exports = {
  startWorker,
};
