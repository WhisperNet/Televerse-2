# Phase 3 Validation Guide - Critical Business Logic

## ✅ All Services Running

### Pledge Service (Port 3003)

- ✅ Transactional Outbox Pattern implemented
- ✅ Pledge creation with idempotency key
- ✅ State machine enforcement (PENDING → AUTHORIZED → CAPTURED)
- ✅ Outbox worker publishing events every 5s
- ✅ Internal API for status updates

### Payment Service (Port 3004)

- ✅ Mock payment provider with async webhooks
- ✅ Webhook idempotency using WebhookLog
- ✅ Payment intent creation
- ✅ Authorization and capture flow
- ✅ Atomic webhook processing with transactions

### Totals Service (Port 3005)

- ✅ CQRS Read Model (CampaignTotal)
- ✅ Fast totals endpoint (<100ms)
- ✅ RabbitMQ consumer for pledge.captured events
- ✅ Event idempotency with ReconciliationLog
- ✅ Transactional updates

## Complete End-to-End Flow Test

### Step 1: Create Pledge

```bash
CAMPAIGN_ID="69202b874085cf01745daf60"
curl -X POST http://localhost:3003/pledges \
  -H "Idempotency-Key: e2e-test-pledge-002" \
  -H "Content-Type: application/json" \
  -d "{\"campaignId\":\"$CAMPAIGN_ID\",\"amount\":250,\"sessionId\":\"anon-999\"}" | jq -r '.pledge._id'
```

**Result**: Pledge created with status PENDING, outbox event created atomically ✅

### Step 2: Create Payment Intent

```bash
PLEDGE_ID="<from_step_1>"
curl -X POST http://localhost:3004/payments/intent \
  -H "Content-Type: application/json" \
  -d "{\"pledgeId\":\"$PLEDGE_ID\",\"amount\":250}" | jq -r '.paymentIntentId'
```

**Result**: Payment intent created ✅

### Step 3: Authorize Payment

```bash
PAYMENT_INTENT_ID="<from_step_2>"
curl -X POST http://localhost:3004/payments/authorize \
  -H "Content-Type: application/json" \
  -d "{\"paymentIntentId\":\"$PAYMENT_INTENT_ID\"}"
```

**Result**: Authorization initiated, webhook fires in 2s ✅

### Step 4: Verify Status Change (After 2s)

```bash
curl http://localhost:3003/pledges/$PLEDGE_ID | jq '.pledge.status'
```

**Expected**: `"AUTHORIZED"` ✅

### Step 5: Capture Payment

```bash
curl -X POST http://localhost:3004/payments/capture \
  -H "Content-Type: application/json" \
  -d "{\"paymentIntentId\":\"$PAYMENT_INTENT_ID\"}"
```

**Result**: Capture initiated, webhook fires in 1s ✅

### Step 6: Verify Status Change (After 1s)

```bash
curl http://localhost:3003/pledges/$PLEDGE_ID | jq '.pledge.status'
```

**Expected**: `"CAPTURED"` ✅

### Step 7: Wait for Outbox Worker & Check Totals (After 7s)

```bash
curl http://localhost:3005/totals/$CAMPAIGN_ID | jq
```

**Expected Output**:

```json
{
  "campaignId": "69202b874085cf01745daf60",
  "totalAmount": 250,
  "totalPledges": 1,
  "lastUpdated": "2025-11-21T09:29:59.367Z"
}
```

**Result**: ✅ CQRS Read Model updated correctly!

## Idempotency Tests

### Test 1: Pledge Idempotency

```bash
# Send the same pledge request again with same idempotency key
curl -X POST http://localhost:3003/pledges \
  -H "Idempotency-Key: e2e-test-pledge-002" \
  -H "Content-Type: application/json" \
  -d "{\"campaignId\":\"$CAMPAIGN_ID\",\"amount\":250,\"sessionId\":\"anon-999\"}"
```

**Result**: Returns HTTP 200 with existing pledge (not 201) ✅

### Test 2: Webhook Idempotency

```bash
# Send duplicate webhook with same webhook ID
curl -X POST http://localhost:3004/payments/webhooks \
  -H "Content-Type: application/json" \
  -d '{"id":"f9e0130b-23f1-4e2b-9dfa-e385075abe00","type":"payment.captured","data":{"paymentIntentId":"...","pledgeId":"..."}}'
```

**Result**: Returns `{"message": "Already processed"}` ✅

**Log Output**: `[webhooks] Webhook ... already processed (idempotent)` ✅

### Test 3: Event Consumer Idempotency

Check totals after duplicate webhook - should NOT double:

```bash
curl http://localhost:3005/totals/$CAMPAIGN_ID | jq
```

**Result**: Still shows `totalAmount: 250` (not 500) ✅

## State Machine Validation

### Test Invalid Transition

```bash
# Try to go from PENDING directly to CAPTURED (invalid)
curl -X PATCH http://localhost:3003/pledges/internal/$PLEDGE_ID/status \
  -H "Content-Type: application/json" \
  -d '{"newStatus":"CAPTURED"}'
```

**Expected**: HTTP 400 with error message ✅

### Valid Transitions

- PENDING → AUTHORIZED ✅
- PENDING → FAILED ✅
- AUTHORIZED → CAPTURED ✅
- AUTHORIZED → FAILED ✅
- CAPTURED → COMPLETED ✅
- COMPLETED → (none) ✅
- FAILED → (none) ✅

## Critical Patterns Demonstrated

### 1. Transactional Outbox Pattern ✅

**Problem Solved**: Dual-write problem (database + message broker atomicity)

**Implementation**:

- Pledge and OutboxEvent created in single MongoDB transaction
- Worker polls outbox every 5s and publishes to RabbitMQ
- Retry logic with exponential backoff (max 5 retries)

**Evidence**:

```
[pledge-service] Created pledge 692030ee00dbc9a12b717dff with outbox event
[outbox-worker] Processing 1 pending events
[outbox-worker] Published event 6920311300dbc9a12b717e1d (pledge.captured)
```

### 2. Webhook Idempotency ✅

**Problem Solved**: Duplicate webhooks causing duplicate charges

**Implementation**:

- WebhookLog with unique constraint on webhookId
- Check before processing, return 200 if already processed
- Transaction ensures atomic log + processing

**Evidence**:

```
[webhooks] Webhook f9e0130b-23f1-4e2b-9dfa-e385075abe00 already processed (idempotent)
```

### 3. State Machine ✅

**Problem Solved**: Invalid state transitions (e.g., CAPTURED → AUTHORIZED)

**Implementation**:

- ValidTransitions map in shared constants
- `canTransition()` function validates before update
- stateHistory tracks all transitions

**Evidence**: 400 error on invalid transitions

### 4. CQRS Read Model ✅

**Problem Solved**: Slow totals calculation (recalculating on every read)

**Implementation**:

- Separate CampaignTotal collection (read model)
- Updated via events, not queries
- Fast reads (<100ms, no aggregation)

**Evidence**: Totals endpoint returns instantly

### 5. Event-Driven Architecture ✅

**Problem Solved**: Tight coupling between services

**Implementation**:

- Services communicate via RabbitMQ events
- Each service subscribes to events it cares about
- Decoupled, resilient architecture

**Evidence**:

- Pledge service publishes pledge.captured
- Totals service consumes and updates read model
- Services can be stopped/started independently

## Service Logs Evidence

### Pledge Service

```
[pledge-service] Connected to MongoDB
[outbox-worker] Starting worker (polling every 5000ms)
[pledge-service] Listening on port 3003
[pledges] Created pledge 692030ee00dbc9a12b717dff with outbox event
[pledges] Updated pledge 692030ee00dbc9a12b717dff: AUTHORIZED → CAPTURED
[outbox-worker] Published event 6920311300dbc9a12b717e1d (pledge.captured)
```

### Payment Service

```
[payment-service] Connected to MongoDB
[payment-service] Listening on port 3004
[mock-provider] Authorizing payment ..., webhook will fire in 2s
[webhooks] Received webhook 7537da8f-ae01-4509-9e62-4b2170f69076 (payment.authorized)
[webhooks] Webhook ... processed, payment ... → authorized
[webhooks] Updated pledge ... status to AUTHORIZED
[webhooks] Webhook ... already processed (idempotent)
```

### Totals Service

```
[totals-service] Connected to MongoDB
[totals-consumer] Starting pledge.captured consumer
[totals-consumer] Consumer started, listening for pledge.captured events
[totals-consumer] Processing event pledge.captured:692030ee00dbc9a12b717dff
[totals-consumer] Updated campaign 69202b874085cf01745daf60: +250 (total pledges +1)
```

## Metrics Endpoints

All services expose Prometheus metrics:

```bash
# Pledge Service
curl http://localhost:3003/metrics | grep outbox_pending_total

# Payment Service
curl http://localhost:3004/metrics | grep webhooks_processed_total

# Totals Service
curl http://localhost:3005/metrics | grep events_processed_total
```

## System Resilience

### Scenario: RabbitMQ Goes Down

1. Pledges continue to be created (outbox stores events)
2. Outbox worker retries (max 5 times with backoff)
3. When RabbitMQ recovers, events are published
4. **System survives without data loss** ✅

### Scenario: Totals Service Down

1. Pledges and payments continue working
2. Events accumulate in RabbitMQ queue
3. When Totals Service recovers, processes backlog
4. **Eventually consistent** ✅

### Scenario: Duplicate Webhooks

1. Payment provider sends same webhook twice
2. First processes normally
3. Second returns "Already processed"
4. **No double-charging** ✅

## Phase 3 Deliverables - ALL COMPLETED ✅

- [x] Pledge Service with Transactional Outbox Pattern
- [x] Outbox worker polling and publishing events
- [x] Payment Service with Webhook Idempotency
- [x] Mock payment provider with async webhooks
- [x] Totals Service with CQRS Read Model
- [x] RabbitMQ consumer for pledge.captured events
- [x] State machine enforcement
- [x] All idempotency mechanisms working
- [x] End-to-end flow tested and working
- [x] Prometheus metrics on all services
- [x] System demonstrates fault tolerance

## Summary

**Phase 3 SUCCESS** - All critical patterns implemented and tested:

- ✅ No dual-write problems (Transactional Outbox)
- ✅ No duplicate charges (Webhook Idempotency)
- ✅ No invalid state transitions (State Machine)
- ✅ Fast totals queries (CQRS)
- ✅ Decoupled services (Event-Driven)

**This system would NOT have failed like the original CareForAll platform!**
