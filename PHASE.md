# CareForAll - 3-Hour MVP Implementation Plan

## Overview

**Total Time**: 3 hours  
**Technology Stack**: JavaScript (Node.js), Express, MongoDB Replica Set, RabbitMQ, React, Docker  
**Monitoring**: Prometheus + Grafana (basic)  
**Logging**: Console logs + Winston (file-based)  
**Focus**: Demonstrate critical patterns (Outbox, Idempotency, State Machine, CQRS)

---

## PHASE 1: Infrastructure Setup (30 minutes)

### Objectives

Set up Docker Compose with all infrastructure components and shared utilities.

### Tasks

#### 1.1 Project Structure

Create monorepo structure:

```
careforall/
├── services/
│   ├── identity-service/
│   ├── campaign-service/
│   ├── pledge-service/
│   ├── payment-service/
│   ├── totals-service/
│   └── comms-service/ (SKIP - bonus only)
├── frontend/
├── shared/
│   ├── utils/
│   │   ├── mongodb.js
│   │   ├── rabbitmq.js
│   │   └── logger.js
│   └── constants.js
├── docker-compose.yml
├── prometheus/
│   └── prometheus.yml
└── .env
```

#### 1.2 Docker Compose Configuration

Create `docker-compose.yml` with:

- **MongoDB**: Single-node replica set (with init container)
- **RabbitMQ**: With management UI
- **Prometheus**: Basic scraping config
- **Grafana**: Pre-configured with Prometheus datasource
- **NGINX**: API Gateway (basic routing)

**Key Configuration Points**:

- MongoDB: `--replSet rs0` flag + init script
- RabbitMQ: Default ports 5672, 15672
- Prometheus: Scrape all services on `/metrics` endpoint
- Grafana: Port 3000, auto-login
- Service replicas: 1 each (no scaling for simplicity)

#### 1.3 Shared Utilities

Create `shared/` package with:

**mongodb.js**:

- Connection helper with retry logic
- Export `connectDB(uri)` function

**rabbitmq.js**:

- Connection pool
- `publishEvent(exchange, routingKey, data)` function
- `consumeQueue(queueName, handler)` function

**logger.js**:

- Winston logger with console + file transport
- Log levels: info, warn, error
- Structured JSON format

**constants.js**:

- PledgeStatus enum
- Valid state transitions map
- Queue/exchange names
- Default config values

#### 1.4 Environment Variables

Create `.env` with:

```
MONGODB_URI=mongodb://mongo:27017
RABBITMQ_URI=amqp://admin:admin123@rabbitmq:5672
JWT_SECRET=hackathon-secret-2025
WEBHOOK_SECRET=webhook-secret-123
```

### Validation

- Run `docker-compose up -d`
- Verify MongoDB replica set: `docker exec mongo mongosh --eval "rs.status()"`
- Access RabbitMQ UI: http://localhost:15672
- Access Grafana: http://localhost:3000
- Verify Prometheus targets: http://localhost:9090/targets

### Deliverables

✅ Working infrastructure stack  
✅ MongoDB replica set initialized  
✅ RabbitMQ ready  
✅ Shared utilities ready  
✅ Monitoring stack accessible

---

## PHASE 2: Core Services Foundation (45 minutes)

### Objectives

Build Identity, Campaign, and basic NGINX gateway with essential functionality only.

### Tasks

#### 2.1 NGINX API Gateway

Create `nginx/nginx.conf`:

- **Routing**:
  - `/api/auth/*` → identity-service:3001
  - `/api/users/*` → identity-service:3001
  - `/api/campaigns/*` → campaign-service:3002
  - `/api/pledges/*` → pledge-service:3003
  - `/api/payments/*` → payment-service:3004
  - `/api/totals/*` → totals-service:3005
  - `/` → frontend:80
- **CORS**: Allow all
- **No rate limiting** (simplicity)

#### 2.2 Identity Service (Minimal)

**Port**: 3001  
**Database**: `identity_db`

**Models**:

- **User**: `{ email, name, passwordHash, role, createdAt }`
  - Roles: 'donor', 'admin'
  - Simple bcrypt hashing
- **AnonymousSession**: `{ sessionId, createdAt, expiresAt }`

**API Endpoints** (implement only these):

1. `POST /api/auth/register` - Register user, return JWT
2. `POST /api/auth/login` - Login, return JWT
3. `POST /api/auth/anonymous-session` - Generate UUID session
4. `GET /api/users/profile` - Get user profile (JWT required)

**JWT Middleware**:

- Extract token from Authorization header
- Verify and attach user to req.user
- Simple error handling

**Prometheus Metrics**:

- Add `/metrics` endpoint
- Basic counter: `http_requests_total`

**No Admin Endpoints** - Skip for MVP

#### 2.3 Campaign Service (Minimal)

**Port**: 3002  
**Database**: `campaigns_db`

**Model**:

- **Campaign**: `{ title, description, goalAmount, ownerId, status, category, endDate, createdAt }`
  - Status: 'active', 'completed'
  - No image URLs (simplicity)

**API Endpoints**:

1. `GET /api/campaigns` - List campaigns (no pagination initially)
2. `GET /api/campaigns/:id` - Get single campaign
3. `POST /api/campaigns` - Create campaign (JWT required)

**RabbitMQ Events**:

- Publish `campaign.created` event after creation

**No Update/Delete** - Skip for MVP

### Validation

- Register user and get JWT token
- Create campaign with JWT
- List campaigns publicly
- Verify campaign.created event in RabbitMQ management UI

### Deliverables

✅ Working Identity Service with JWT auth  
✅ Working Campaign Service with basic CRUD  
✅ NGINX routing to both services  
✅ Anonymous session support  
✅ Basic Prometheus metrics

---

## PHASE 3: Critical Business Logic (45 minutes)

### Objectives

Implement Pledge Service (with Outbox), Payment Service (with Idempotency), and Totals Service (with CQRS). This is the MOST IMPORTANT phase.

### Tasks

#### 3.1 Pledge Service (CRITICAL - Outbox Pattern)

**Port**: 3003  
**Database**: `pledges_db`

**Models**:

- **Pledge**:

  ```javascript
  {
    idempotencyKey: String (unique index),
    campaignId: ObjectId,
    donorId: ObjectId (nullable),
    sessionId: String (nullable),
    amount: Number,
    status: String (enum: PENDING, AUTHORIZED, CAPTURED, COMPLETED, FAILED),
    stateHistory: [{ from, to, timestamp }],
    createdAt: Date
  }
  ```

- **OutboxEvent**:
  ```javascript
  {
    aggregateId: ObjectId (pledgeId),
    eventType: String,
    payload: Object,
    status: String (enum: pending, published, failed),
    retryCount: Number,
    createdAt: Date
  }
  ```

**API Endpoints**:

1. `POST /api/pledges` - Create pledge

   - **MUST have** `Idempotency-Key` header
   - Validate campaign exists (call Campaign Service)
   - Use MongoDB transaction:
     - Create Pledge document
     - Create OutboxEvent document
     - Commit together (atomicity)
   - Handle duplicate key error → return existing pledge

2. `GET /api/pledges/:id` - Get pledge details

3. `PATCH /internal/pledges/:id/status` - Internal endpoint for Payment Service
   - Validate state transition using constants
   - Update status and append to stateHistory
   - Create outbox event for status change

**State Machine** (use shared/constants.js):

```javascript
VALID_TRANSITIONS = {
  PENDING: ['AUTHORIZED', 'FAILED'],
  AUTHORIZED: ['CAPTURED', 'FAILED'],
  CAPTURED: ['COMPLETED'],
  COMPLETED: [],
  FAILED: [],
};
```

**Outbox Worker** (background process in same service):

- Run every 5 seconds
- Query OutboxEvent where status='pending'
- Publish to RabbitMQ exchange
- Update status to 'published' on success
- Increment retryCount on failure (max 5 retries)
- Simple exponential backoff: `Math.pow(2, retryCount) * 1000`

**RabbitMQ Events**:

- `pledge.created`
- `pledge.captured`

#### 3.2 Payment Service (CRITICAL - Webhook Idempotency)

**Port**: 3004  
**Database**: `payments_db`

**Models**:

- **PaymentTransaction**:

  ```javascript
  {
    pledgeId: ObjectId,
    paymentIntentId: String,
    amount: Number,
    status: String (pending, authorized, captured, failed),
    createdAt: Date
  }
  ```

- **WebhookLog**:
  ```javascript
  {
    webhookId: String (unique index),
    eventType: String,
    pledgeId: ObjectId,
    payload: Object,
    processed: Boolean,
    processedAt: Date,
    createdAt: Date
  }
  ```

**Mock Payment Provider** (in-memory):

- `createPaymentIntent(amount)` → return `{ id: uuid, status: 'pending' }`
- `authorizePayment(intentId)` → delay 1-2s, trigger webhook
- `capturePayment(intentId)` → delay 1s, trigger webhook
- Webhooks: POST to own `/api/payments/webhooks` endpoint

**API Endpoints**:

1. `POST /api/payments/intent` - Create payment intent

   - Body: `{ pledgeId, amount }`
   - Create PaymentTransaction
   - Call mock provider

2. `POST /api/payments/authorize` - Authorize payment

   - Body: `{ paymentIntentId }`
   - Mock provider triggers webhook async

3. `POST /api/payments/webhooks` - Webhook handler (CRITICAL)
   - Body: `{ id: webhookId, type: eventType, data: {...} }`
   - **Check WebhookLog for webhookId** (idempotency)
   - If exists and processed → return 200 immediately
   - Use MongoDB transaction:
     - Create WebhookLog with processed=true
     - Update PaymentTransaction status
   - Call Pledge Service internal API to update status
   - Return 200

**Webhook Flow**:

```
Mock Provider → (2s delay) → POST /api/payments/webhooks
  → Check idempotency
  → Update payment status
  → Update pledge status
  → Done
```

#### 3.3 Totals Service (CRITICAL - CQRS Read Model)

**Port**: 3005  
**Database**: `totals_db`

**Models**:

- **CampaignTotal**:

  ```javascript
  {
    campaignId: ObjectId (unique index),
    totalAmount: Number,
    totalPledges: Number,
    lastUpdated: Date
  }
  ```

- **ReconciliationLog**:
  ```javascript
  {
    campaignId: ObjectId,
    pledgeId: ObjectId,
    amount: Number,
    operation: String (add/subtract),
    eventId: String (unique index for idempotency),
    processedAt: Date
  }
  ```

**API Endpoints**:

1. `GET /api/totals/:campaignId` - Get pre-calculated totals
   - Return from CampaignTotal collection
   - Target: < 100ms response time
   - If not found, return `{ totalAmount: 0, totalPledges: 0 }`

**RabbitMQ Consumer** (start on service init):

- Queue: `totals.pledge.captured`
- Bind to exchange with routing key: `pledge.captured`
- Handler:

  ```javascript
  async function handlePledgeCaptured(event) {
    const { pledgeId, campaignId, amount } = event;
    const eventId = `pledge.captured:${pledgeId}`;

    // Check if already processed (idempotency)
    const existing = await ReconciliationLog.findOne({ eventId });
    if (existing) return;

    // Use transaction
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
    } catch (error) {
      await session.abortTransaction();
      throw error;
    }
  }
  ```

### Validation

- Create pledge with idempotency key
- Retry with same key → get existing pledge
- Authorize payment → webhook triggered
- Capture payment → webhook triggered
- Check pledge status updated to CAPTURED
- Query totals endpoint → verify amount updated
- Send duplicate webhook → verify not reprocessed
- Check RabbitMQ queues for events

### Deliverables

✅ Pledge Service with Transactional Outbox Pattern  
✅ Payment Service with Webhook Idempotency  
✅ Totals Service with CQRS Read Model  
✅ State machine enforcement  
✅ Working outbox worker  
✅ End-to-end event flow

---

## PHASE 4: Frontend + Integration Testing (45 minutes)

### Objectives

Build minimal React frontend and test full donation flow.

### Tasks

#### 4.1 React Frontend (Minimal)

**Tech Stack**: React + Vite, plain CSS (no UI library)

**Pages** (implement only these):

1. **HomePage** (`/`)

   - List of campaigns (simple cards)
   - Each card: title, goalAmount, current progress bar, "Donate" button
   - Fetch from `/api/campaigns`
   - Fetch totals for each campaign from `/api/totals/:id`

2. **CampaignDetailPage** (`/campaign/:id`)

   - Campaign details
   - Progress bar (large)
   - Pledge form:
     - Amount input (number field)
     - Anonymous checkbox
     - If anonymous: Name, Email fields
     - "Donate Now" button
   - On submit:
     - Generate UUID for Idempotency-Key
     - If anonymous, create session (store in localStorage)
     - POST `/api/pledges` with headers
     - Show payment mock UI (just a confirmation button)
     - Call `/api/payments/intent` then `/api/payments/authorize`
     - Show success message with pledge ID

3. **LoginPage** (`/login`)

   - Email + Password form
   - POST `/api/auth/login`
   - Store JWT in localStorage
   - Redirect to home

4. **CreateCampaignPage** (`/create-campaign`)
   - Form: title, description, goalAmount, category, endDate
   - POST `/api/campaigns` with JWT
   - Redirect to campaign detail

**Components**:

- `CampaignCard.jsx` - Display single campaign
- `PledgeForm.jsx` - Donation form
- `ProgressBar.jsx` - Visual progress bar

**Routing**: React Router with routes:

- `/` → HomePage
- `/campaign/:id` → CampaignDetailPage
- `/login` → LoginPage
- `/create-campaign` → CreateCampaignPage

**API Layer**: Simple axios instance with JWT interceptor

#### 4.2 Dockerize Frontend

- Multi-stage Dockerfile (build + nginx serve)
- Serve on port 80
- Proxy API calls through NGINX gateway

#### 4.3 Integration Testing

**Test Scenario 1: Full Donation Flow**

1. Start all services: `docker-compose up -d`
2. Access frontend: http://localhost
3. Click "Donate" on a campaign
4. Fill pledge form as anonymous ($50)
5. Submit pledge
6. Click "Pay Now" (mock payment)
7. Wait 3 seconds for webhooks
8. Refresh page → verify totals show $50
9. Check logs for event flow

**Test Scenario 2: Idempotency**

1. Open browser DevTools Network tab
2. Create pledge, copy Idempotency-Key header
3. Use curl to repeat request with same key
4. Verify same pledge returned
5. Check database → only 1 pledge exists

**Test Scenario 3: Kill Switch Demo**

1. Create campaign
2. Create 3 pledges ($100 each) → verify totals = $300
3. Stop Totals Service: `docker stop totals-service`
4. Create 2 more pledges ($100 each) → pledges still work!
5. Check totals endpoint → shows $300 (stale)
6. Restart Totals Service: `docker start totals-service`
7. Wait 10 seconds
8. Check totals → now shows $500 (caught up!)

### Validation

- Complete full user journey from browsing to donation
- Verify idempotency prevents duplicates
- Verify state machine prevents invalid transitions
- Verify outbox ensures event delivery
- Verify Kill Switch demo works reliably

### Deliverables

✅ Working React frontend  
✅ Full donation flow functional  
✅ Kill Switch demo rehearsed  
✅ Integration tests passing  
✅ System runs end-to-end

---

## PHASE 5: Observability + CI/CD (15 minutes)

### Objectives

Add basic monitoring and CI pipeline to satisfy Checkpoints 3 & 4.

### Tasks

#### 5.1 Prometheus Metrics (All Services)

Add to each service:

```javascript
const promClient = require('prom-client');
const register = new promClient.Registry();

// Add default metrics (CPU, memory)
promClient.collectDefaultMetrics({ register });

// Custom counter
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

#### 5.2 Grafana Dashboard (Pre-configured)

Create `grafana/dashboards/overview.json`:

- Panel 1: HTTP Request Rate (all services)
- Panel 2: Pledge Creation Rate
- Panel 3: Outbox Event Lag (pending events count)
- Panel 4: RabbitMQ Queue Depth
- Panel 5: System Memory/CPU

Import into Grafana via provisioning.

#### 5.3 Logging (Simple Winston)

Each service logs to:

- Console (JSON format)
- File: `/var/log/{service-name}.log`

Key log events:

- Pledge created (with amount)
- Outbox event published
- Webhook received (with webhookId)
- State transition (with from/to status)
- Event consumed (with eventType)

#### 5.4 CI/CD Pipeline (Minimal GitHub Actions)

Create `.github/workflows/ci.yml`:

```yaml
name: CI Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:6
      rabbitmq:
        image: rabbitmq:3.12

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: npm test
        env:
          MONGODB_URI: mongodb://localhost:27017/test
          RABBITMQ_URI: amqp://guest:guest@localhost:5672

  docker-build:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v3
      - name: Build Docker images
        run: docker-compose build
```

**Testing Strategy**:

- Unit tests for critical functions (state machine, idempotency)
- Use Jest (simple, fast)
- Focus on:
  - State transition validation
  - Idempotency key handling
  - Outbox event creation

**No Integration Tests in CI** - Run manually for speed

### Validation

- Access Grafana dashboards: http://localhost:3000
- View metrics in Prometheus: http://localhost:9090
- Check log files in containers
- Push code to GitHub → verify CI runs
- Verify tests pass

### Deliverables

✅ Prometheus metrics on all services  
✅ Grafana dashboard with key metrics  
✅ Structured logging (Winston)  
✅ GitHub Actions CI pipeline  
✅ Basic unit tests  
✅ Docker build automation

---

## FINAL DEMO CHECKLIST

### Pre-Demo Setup (5 minutes)

1. Clean start: `docker-compose down -v && docker-compose up -d`
2. Wait for all services healthy
3. Create 1 test campaign via API or frontend
4. Open tabs:
   - Frontend: http://localhost
   - Grafana: http://localhost:3000
   - RabbitMQ: http://localhost:15672
   - Prometheus: http://localhost:9090

### Demo Flow (10 minutes)

**Part 1: Normal Operation** (3 min)

1. Show frontend with campaigns
2. Create pledge as anonymous donor ($100)
3. Show totals updated in real-time
4. Show Grafana dashboard (metrics spiking)
5. Show RabbitMQ events flowing

**Part 2: Kill Switch Demo** (4 min)

1. Create 3 pledges → totals = $300
2. Open terminal: `docker stop totals-service`
3. Create 2 more pledges → **still works!**
4. Show totals endpoint returns $300 (stale)
5. Show RabbitMQ queue building up
6. Restart: `docker start totals-service`
7. Wait 10 seconds
8. Refresh totals → $500 ✅ (caught up!)
9. **"This is fault tolerance - old system crashed immediately"**

**Part 3: Technical Deep Dive** (3 min)

1. Show MongoDB transaction code (Pledge + Outbox)
2. Show Webhook idempotency check
3. Show State Machine validation
4. Show Prometheus metrics (request rates)
5. Show CI pipeline passing (GitHub Actions)

### Talking Points

- ✅ **Transactional Outbox**: Guarantees no lost donations
- ✅ **Idempotency**: Prevents duplicate charges
- ✅ **State Machine**: Enforces valid payment flow
- ✅ **CQRS**: High-performance totals endpoint
- ✅ **Fault Tolerance**: System survives service failures
- ✅ **Observability**: Full visibility with Prometheus + Grafana
- ✅ **CI/CD**: Automated testing and deployment

---

## CHECKPOINT COVERAGE

| Checkpoint                            | Coverage | Evidence                                          |
| ------------------------------------- | -------- | ------------------------------------------------- |
| **Checkpoint 1: Architecture**        | ✅       | 6 microservices, event-driven, MongoDB + RabbitMQ |
| **Checkpoint 2: Core Implementation** | ✅       | Outbox, Idempotency, State Machine, CQRS working  |
| **Checkpoint 3: Observability**       | ✅       | Prometheus + Grafana, structured logging          |
| **Checkpoint 4: CI/CD**               | ✅       | GitHub Actions pipeline, automated tests          |

---

## TIME BREAKDOWN

| Phase                              | Duration    | Critical Path       |
| ---------------------------------- | ----------- | ------------------- |
| Phase 1: Infrastructure            | 30 min      | Yes                 |
| Phase 2: Identity + Campaign       | 45 min      | Yes                 |
| Phase 3: Pledge + Payment + Totals | 45 min      | Yes (MOST CRITICAL) |
| Phase 4: Frontend + Integration    | 45 min      | Yes                 |
| Phase 5: Observability + CI/CD     | 15 min      | Yes                 |
| **Total**                          | **3 hours** |                     |

**Buffer**: None (tight schedule, focus on core)

---

## SUCCESS CRITERIA

### Must Have (Minimum for Demo):

1. ✅ User can browse campaigns
2. ✅ User can create pledge (anonymous)
3. ✅ Payment flows through mock provider
4. ✅ Totals update in real-time
5. ✅ Idempotency prevents duplicates
6. ✅ Kill Switch demo works
7. ✅ Prometheus + Grafana accessible
8. ✅ CI pipeline runs

### Nice to Have (If Time Permits):

1. User registration/login
2. Campaign creation UI
3. Admin dashboard (skip this)
4. More Grafana panels
5. Integration tests

---

## SIMPLIFICATIONS FROM ORIGINAL PLAN

| Original              | Simplified         | Reason             |
| --------------------- | ------------------ | ------------------ |
| TypeScript            | JavaScript         | Faster development |
| ELK Stack             | Winston + Console  | Simpler setup      |
| Jaeger Tracing        | Removed            | Too complex        |
| Node Exporter         | Removed            | Not critical       |
| 2-3 replicas          | 1 replica          | Simplicity         |
| Admin Service         | Merged to Identity | Fewer services     |
| Comms Service         | Skipped            | Bonus only         |
| Extensive Testing     | Basic Unit Tests   | Time constraint    |
| Semantic Versioning   | Simple tagging     | Faster CI          |
| Rate Limiting         | Removed            | Not critical       |
| User Donation History | Simplified         | Basic query        |

---

## RISK MITIGATION

**Risk 1: MongoDB Replica Set Fails**

- Mitigation: Test in Phase 1, abort if issues
- Fallback: Use standalone (lose transactions)

**Risk 2: Time Runs Out**

- Mitigation: Phase 3 is priority, skip Phase 5 if needed
- Fallback: Show architecture diagram only

**Risk 3: Service Communication Fails**

- Mitigation: Test each service with curl immediately
- Fallback: Mock responses temporarily

**Risk 4: Docker Build Issues**

- Mitigation: Use simple Node.js base image
- Fallback: Run services locally (node server.js)

---

## AI IMPLEMENTATION TIPS

When using AI tools to implement:

1. **Start with Phase 1**: Get infrastructure working first
2. **One service at a time**: Complete each service fully before next
3. **Test immediately**: After each endpoint, test with curl
4. **Copy-paste patterns**: Use Pledge Service outbox as template
5. **Use Docker logs**: Debug with `docker logs <service-name>`
6. **Focus on Phase 3**: This is where judges look for patterns
7. **Keep it simple**: Resist feature creep
8. **Document as you go**: Add comments explaining patterns

---

## WINNING FORMULA

1. **Working Demo** > Perfect Code
2. **Show Kill Switch** = Instant Credibility
3. **Grafana Dashboard** = Visual Appeal
4. **Explain Patterns** = Technical Depth
5. **GitHub Actions** = Professional Polish

**Build fast, demo confidently, explain patterns clearly.** 🚀
