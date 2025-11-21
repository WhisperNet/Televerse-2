# Phase 2 Validation Guide

## Services Status

### Identity Service (Port 3001)

- ✅ User registration
- ✅ User login with JWT
- ✅ Anonymous session creation
- ✅ JWT-protected profile endpoint
- ✅ Prometheus metrics exposed

### Campaign Service (Port 3002)

- ✅ List campaigns
- ✅ Get single campaign
- ✅ Create campaign (JWT protected)
- ✅ RabbitMQ event publishing
- ✅ Prometheus metrics exposed

### NGINX Gateway (Port 8080)

- ✅ Routes `/api/auth/*` to Identity Service
- ✅ Routes `/api/users/*` to Identity Service
- ✅ Routes `/api/campaigns*` to Campaign Service
- ✅ CORS enabled
- ✅ Health check endpoint

## Test Commands

### 1. Register a new user

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","name":"Demo User","password":"demo123"}'
```

### 2. Login and save JWT token

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"demo123"}' \
  | jq -r '.token' > /tmp/jwt.txt
```

### 3. Get user profile (JWT required)

```bash
JWT_TOKEN=$(cat /tmp/jwt.txt)
curl http://localhost:8080/api/users/profile \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 4. Create anonymous session

```bash
curl -X POST http://localhost:8080/api/auth/anonymous-session
```

### 5. List campaigns

```bash
curl http://localhost:8080/api/campaigns | jq
```

### 6. Create a campaign (JWT required)

```bash
JWT_TOKEN=$(cat /tmp/jwt.txt)
curl -X POST http://localhost:8080/api/campaigns \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Help John Medical Fund",
    "description": "Support John recovery",
    "goalAmount": 5000,
    "category": "medical",
    "endDate": "2025-12-31"
  }' | jq
```

### 7. Get single campaign

```bash
CAMPAIGN_ID="<id_from_create_response>"
curl http://localhost:8080/api/campaigns/$CAMPAIGN_ID | jq
```

### 8. Check Prometheus metrics

```bash
# Identity Service
curl http://localhost:3001/metrics | grep http_requests_total

# Campaign Service
curl http://localhost:3002/metrics | grep http_requests_total
```

### 9. Verify RabbitMQ events

```bash
# Check if exchange exists
curl -u admin:admin123 http://localhost:15672/api/exchanges/%2F/careforall.events

# Check campaign service logs for event publishing
docker logs careforall-campaign | grep "campaign.created"
```

## Expected Results

### User Registration Response

```json
{
  "message": "User registered successfully",
  "token": "eyJhbGc...",
  "user": {
    "id": "...",
    "email": "demo@example.com",
    "name": "Demo User",
    "role": "donor"
  }
}
```

### Campaign List Response

```json
{
  "campaigns": [
    {
      "_id": "...",
      "title": "Help John Medical Fund",
      "description": "Support John recovery",
      "goalAmount": 5000,
      "ownerId": "...",
      "status": "active",
      "category": "medical",
      "endDate": "2025-12-31T00:00:00.000Z",
      "createdAt": "2025-11-21T...",
      "__v": 0
    }
  ],
  "count": 1
}
```

## Container Status

Check all services are running:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Expected output:

- careforall-identity: Up (port 3001)
- careforall-campaign: Up (port 3002)
- careforall-nginx: Up (port 8080)
- careforall-mongo: Up (healthy)
- careforall-rabbitmq: Up (healthy, ports 5672, 15672)
- careforall-prometheus: Up (port 9090)
- careforall-grafana: Up (port 3000)

## Troubleshooting

### Service won't start

```bash
docker logs careforall-<service-name>
docker compose restart <service-name>
```

### JWT token expired

Re-login to get a new token:

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"demo123"}' \
  | jq -r '.token' > /tmp/jwt.txt
```

### NGINX routing issues

```bash
docker logs careforall-nginx --tail 20
docker compose restart nginx
```

## Phase 2 Deliverables ✅

- [x] Identity Service with JWT authentication
- [x] User registration and login working
- [x] Anonymous session support
- [x] JWT-protected endpoints
- [x] Campaign Service with CRUD operations
- [x] Campaign creation with JWT auth
- [x] RabbitMQ event publishing (`campaign.created`)
- [x] NGINX API Gateway routing all services
- [x] Prometheus metrics on both services
- [x] All endpoints accessible via gateway (`http://localhost:8080/api/*`)
- [x] CORS enabled for frontend access
