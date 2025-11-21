const CampaignTotal = require('../models/CampaignTotal');
const ReconciliationLog = require('../models/ReconciliationLog');
const { mongoose } = require('/usr/src/app/shared/utils/mongodb');
const { consumeQueue } = require('/usr/src/app/shared/utils/rabbitmq');
const { Queues, RoutingKeys } = require('/usr/src/app/shared/constants');
const { eventsProcessedTotal } = require('../metrics');

async function handlePledgeCaptured(event) {
  const { pledgeId, campaignId, amount } = event;
  const eventId = `pledge.captured:${pledgeId}`;

  console.log(
    `[totals-consumer] Processing event ${eventId} for campaign ${campaignId}`
  );

  // Idempotency check
  const existing = await ReconciliationLog.findOne({ eventId });
  if (existing) {
    console.log(
      `[totals-consumer] Event ${eventId} already processed (idempotent)`
    );
    eventsProcessedTotal.inc({
      event_type: 'pledge.captured',
      status: 'duplicate',
    });
    return;
  }

  // Start transaction
  const session = await mongoose.startSession();
  await session.startTransaction();

  try {
    // Update read model (upsert)
    await CampaignTotal.findOneAndUpdate(
      { campaignId },
      {
        $inc: { totalAmount: amount, totalPledges: 1 },
        $set: { lastUpdated: new Date() },
      },
      { session, upsert: true }
    );

    // Log reconciliation
    await ReconciliationLog.create(
      [
        {
          campaignId,
          pledgeId,
          amount,
          operation: 'add',
          eventId,
          processedAt: new Date(),
        },
      ],
      { session }
    );

    await session.commitTransaction();
    console.log(
      `[totals-consumer] Updated campaign ${campaignId}: +${amount} (total pledges +1)`
    );
    eventsProcessedTotal.inc({
      event_type: 'pledge.captured',
      status: 'success',
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('[totals-consumer] Error processing event:', error);
    eventsProcessedTotal.inc({
      event_type: 'pledge.captured',
      status: 'error',
    });
    throw error;
  } finally {
    session.endSession();
  }
}

async function startConsumer() {
  console.log('[totals-consumer] Starting pledge.captured consumer');
  await consumeQueue(
    Queues.PLEDGE_CAPTURED,
    RoutingKeys.PLEDGE_CAPTURED,
    handlePledgeCaptured
  );
  console.log(
    '[totals-consumer] Consumer started, listening for pledge.captured events'
  );
}

module.exports = {
  startConsumer,
};
