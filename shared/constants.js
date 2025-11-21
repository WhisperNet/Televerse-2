const PledgeStatus = Object.freeze({
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

const ValidTransitions = Object.freeze({
  [PledgeStatus.PENDING]: [PledgeStatus.AUTHORIZED, PledgeStatus.FAILED],
  [PledgeStatus.AUTHORIZED]: [PledgeStatus.CAPTURED, PledgeStatus.FAILED],
  [PledgeStatus.CAPTURED]: [PledgeStatus.COMPLETED],
  [PledgeStatus.COMPLETED]: [],
  [PledgeStatus.FAILED]: [],
});

const Exchanges = Object.freeze({
  EVENTS: process.env.RABBITMQ_EXCHANGE || 'careforall.events',
});

const Queues = Object.freeze({
  PLEDGE_CREATED: 'pledge.created.queue',
  PLEDGE_CAPTURED: 'totals.pledge.captured',
});

const RoutingKeys = Object.freeze({
  PLEDGE_CREATED: 'pledge.created',
  PLEDGE_CAPTURED: 'pledge.captured',
});

module.exports = {
  PledgeStatus,
  ValidTransitions,
  Exchanges,
  Queues,
  RoutingKeys,
};
