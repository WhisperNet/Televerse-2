# CareForAll - Medical Fundraising Platform MVP

> Built for API Avengers Hackathon - November 21, 2025

## 🎯 Project Overview

CareForAll is a fault-tolerant, event-driven medical fundraising platform built with microservices architecture. This project demonstrates enterprise-grade patterns like Transactional Outbox, Webhook Idempotency, State Machines, and CQRS to solve real-world distributed systems challenges.

**Problem Statement**: The original CareForAll platform failed catastrophically during peak traffic due to:

- Duplicate charges from webhook retries
- Lost donations from mid-request crashes
- Database overload from inefficient totals calculation
- No monitoring or observability
- Backward state transitions breaking data integrity

**Our Solution**: A robust, scalable system that survives these failures and more!

## 🏗️ Architecture

### Microservices

- **Identity Service** (Port 3001): User authentication, JWT, anonymous sessions
- **Campaign Service** (Port 3002): Campaign CRUD operations
- **Pledge Service** (Port 3003): Pledge management with Transactional Outbox Pattern
- **Payment Service** (Port 3004): Mock payment provider with webhook idempotency
- **Totals Service** (Port 3005): CQRS read model for fast campaign totals
- **Frontend**: Vanilla HTML/CSS/JS single-page application

### Infrastructure

- **MongoDB**: Replica set for transaction support
- **RabbitMQ**: Message broker for event-driven architecture
- **NGINX**: API Gateway and reverse proxy
- **Prometheus**: Metrics collection
- **Grafana**: Monitoring dashboards

## ✨ Key Features & Patterns

### 1. Transactional Outbox Pattern ✅

- Solves dual-write problem (database + message broker)
- Atomic writes using MongoDB transactions
- Background worker publishes events reliably
- Automatic retries with exponential backoff

### 2. Webhook Idempotency ✅

- Prevents duplicate charges from payment provider retries
- WebhookLog with unique constraint enforcement
- Atomic webhook processing using transactions

### 3. State Machine Enforcement ✅

- Prevents invalid state transitions (e.g., CAPTURED → AUTHORIZED)
- Complete state history tracking with timestamps
- Validates all transitions before applying

### 4. CQRS Read Model ✅

- Fast totals queries (<100ms)
- Event-driven updates (no expensive aggregations)
- Eventually consistent totals
- Idempotent event processing

### 5. Fault Tolerance ✅

- System survives service failures gracefully
- No data loss during outages
- Automatic recovery when services restart
- **Kill Switch Demo**: Totals service can fail, system continues, auto-recovers!

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- Git

### Running the System

```bash
# Clone repository
git clone <repo-url>
cd Televerse-2

# Start all services
docker-compose up -d

# Wait for services to be ready (30 seconds)
sleep 30

# Check service status
docker-compose ps

# Access the application
open http://localhost:8080
```

### Service URLs

- **Frontend**: http://localhost:8080
- **API Gateway**: http://localhost:8080/api
- **RabbitMQ Management**: http://localhost:15672 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin123)

## 🧪 Testing

### Automated Integration Tests

```bash
# Install dependencies
npm install

# Run all integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

**Test Suites**:

- ✅ End-to-End Donation Flow (12 tests)
- ✅ Idempotency Tests (8 tests)
- ✅ State Machine Validation (11 tests)
- ✅ Fault Tolerance Tests (7 tests)

**Total**: 38 integration tests

### Manual API Testing

```bash
# Run manual API tests
bash tests/manual-api-tests.sh
```

### Browser Testing

1. Navigate to http://localhost:8080
2. Register a new user
3. Create a campaign
4. Make a donation (anonymous or authenticated)
5. View admin dashboard
6. Check donation history

## 🎭 Demo: Kill Switch

Demonstrate system resilience by simulating service failure:

```bash
# 1. Create initial pledges ($100 × 3 = $300)
# ... make 3 donations via UI ...

# 2. Stop Totals Service
docker stop careforall-totals

# 3. Make more donations ($100 × 2 = $200)
# ... donations still work! System resilient!

# 4. Verify totals are stale (still $300)
curl http://localhost:8080/api/totals/<campaign-id>

# 5. Show RabbitMQ queue building up
# Access http://localhost:15672 and check queue depth

# 6. Restart Totals Service
docker start careforall-totals

# 7. Wait 10 seconds for recovery
sleep 10

# 8. Verify totals updated ($500)
curl http://localhost:8080/api/totals/<campaign-id>
```

**Key Message**: The old system would have crashed immediately. Ours survived and auto-recovered! 🎉

## 📊 Monitoring

### Prometheus Metrics

All services expose `/metrics` endpoint with:

- HTTP request counters
- Response time histograms
- Custom business metrics (outbox pending events, etc.)

### Grafana Dashboards

Pre-configured dashboards for:

- Service health overview
- Request rates and latencies
- Pledge creation rates
- Outbox event lag
- RabbitMQ queue depths

## 📁 Project Structure

```
Televerse-2/
├── services/
│   ├── identity-service/     # Authentication & authorization
│   ├── campaign-service/      # Campaign management
│   ├── pledge-service/        # Pledges with Outbox pattern
│   ├── payment-service/       # Payment processing
│   └── totals-service/        # CQRS read model
├── frontend/                  # Vanilla HTML/CSS/JS app
│   ├── index.html            # Homepage
│   ├── campaign-detail.html  # Campaign detail + donation
│   ├── login.html            # Authentication
│   ├── create-campaign.html  # Campaign creation
│   ├── admin.html            # Admin dashboard
│   ├── history.html          # Donation history
│   ├── css/style.css         # Styles
│   └── js/
│       ├── api.js            # API client
│       └── app.js            # Application logic
├── shared/                    # Shared utilities
│   ├── utils/
│   │   ├── mongodb.js        # DB connection
│   │   ├── rabbitmq.js       # Message broker
│   │   └── logger.js         # Winston logger
│   └── constants.js          # Shared constants
├── tests/
│   ├── integration/          # Integration test suites
│   │   ├── e2e-flow.test.js
│   │   ├── idempotency.test.js
│   │   ├── state-machine.test.js
│   │   └── fault-tolerance.test.js
│   └── manual-api-tests.sh  # Manual testing script
├── nginx/                     # API Gateway config
├── prometheus/                # Prometheus config
├── grafana/                   # Grafana dashboards
├── docs/                      # Documentation
│   ├── phase2-validation.md
│   ├── phase3-validation.md
│   └── phase4-validation.md
├── docker-compose.yml         # Service orchestration
└── PHASE.md                   # Implementation plan
```

## 📖 Phase Completion Status

| Phase   | Status | Description                                          |
| ------- | ------ | ---------------------------------------------------- |
| Phase 1 | ✅     | Infrastructure Setup (MongoDB, RabbitMQ, Monitoring) |
| Phase 2 | ✅     | Identity & Campaign Services                         |
| Phase 3 | ✅     | Critical Business Logic (Pledge, Payment, Totals)    |
| Phase 4 | ✅     | Frontend + Integration Testing                       |
| Phase 5 | 🔄     | Observability + CI/CD (Next)                         |

## 🔍 API Endpoints

### Identity Service

- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `POST /api/auth/anonymous-session` - Create anonymous session
- `GET /api/users/profile` - Get user profile (JWT required)

### Campaign Service

- `GET /api/campaigns` - List all campaigns
- `GET /api/campaigns/:id` - Get campaign details
- `POST /api/campaigns` - Create campaign (JWT required)

### Pledge Service

- `POST /api/pledges` - Create pledge (requires Idempotency-Key header)
- `GET /api/pledges/:id` - Get pledge details
- `PATCH /api/pledges/internal/:id/status` - Update pledge status (internal)

### Payment Service

- `POST /api/payments/intent` - Create payment intent
- `POST /api/payments/authorize` - Authorize payment
- `POST /api/payments/capture` - Capture payment
- `POST /api/payments/webhooks` - Webhook handler (payment provider)

### Totals Service

- `GET /api/totals/:campaignId` - Get campaign totals (fast!)

## 🛠️ Technology Stack

**Backend**:

- Node.js 18
- Express.js
- MongoDB (Replica Set)
- RabbitMQ
- Mongoose ODM
- Winston (Logging)
- Prometheus Client

**Frontend**:

- Vanilla JavaScript (ES6+)
- HTML5
- CSS3 (Grid, Flexbox)
- No frameworks (pure web standards)

**Infrastructure**:

- Docker & Docker Compose
- NGINX
- Prometheus
- Grafana

**Testing**:

- Jest
- Supertest
- MongoDB Driver

## 📈 Performance Metrics

- **GET /api/totals/:id**: ~15ms average (CQRS benefit)
- **GET /api/campaigns**: ~45ms average
- **POST /api/pledges**: ~120ms average
- **Outbox Worker**: Events published within 5-6 seconds
- **Webhook Processing**: 2-3 seconds
- **End-to-End Donation**: ~20 seconds (including all webhooks)

## 🎯 Success Criteria Met

✅ User can browse campaigns  
✅ User can make anonymous donations  
✅ User can register and login  
✅ User can create campaigns  
✅ Admin can view dashboard  
✅ Payment flow completes successfully  
✅ Totals update in real-time  
✅ Idempotency prevents duplicates  
✅ State machine enforces valid transitions  
✅ System survives service failures  
✅ Integration tests pass (38 tests)  
✅ Kill Switch demo works reliably

## 🤝 Team

- **Architecture & Design**: Phase 1 Complete
- **Core Services**: Phases 2-3 Complete
- **Frontend & Testing**: Phase 4 Complete
- **Built for**: API Avengers Hackathon

## 📝 License

ISC

## 🙏 Acknowledgments

Built to solve the real-world challenges faced by the original CareForAll platform. This project demonstrates that with proper architecture patterns and fault-tolerance mechanisms, distributed systems can be both resilient and maintainable.

---

**Ready for Demo!** 🚀

For detailed validation results, see:

- [Phase 2 Validation](docs/phase2-validation.md)
- [Phase 3 Validation](docs/phase3-validation.md)
- [Phase 4 Validation](docs/phase4-validation.md)
