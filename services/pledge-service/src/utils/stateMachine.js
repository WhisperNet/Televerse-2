const { ValidTransitions } = require('/usr/src/app/shared/constants');

function canTransition(currentStatus, newStatus) {
  const allowed = ValidTransitions[currentStatus] || [];
  return allowed.includes(newStatus);
}

function recordTransition(stateHistory, from, to) {
  return [...stateHistory, { from, to, timestamp: new Date() }];
}

module.exports = {
  canTransition,
  recordTransition,
};
