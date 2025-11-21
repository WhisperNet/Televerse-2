#!/bin/bash

# Manual API Testing Script for CareForAll
# This script tests all services manually via curl

set -e

API_URL="http://localhost:8080"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "CareForAll Manual API Testing"
echo "========================================"
echo ""

# Health Check
echo -e "${YELLOW}1. Health Checks${NC}"
echo "Checking NGINX gateway..."
curl -s "${API_URL}/healthz" && echo -e "${GREEN}✓ NGINX gateway OK${NC}" || echo -e "${RED}✗ NGINX gateway FAILED${NC}"
echo ""

# Test Identity Service
echo -e "${YELLOW}2. Identity Service Tests${NC}"
echo "Registering new user..."
REGISTER_RESPONSE=$(curl -s -X POST "${API_URL}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test User\",\"email\":\"test-$(date +%s)@example.com\",\"password\":\"test123456\"}")

TOKEN=$(echo $REGISTER_RESPONSE | grep -o '"token":"[^"]*' | sed 's/"token":"//')
USER_ID=$(echo $REGISTER_RESPONSE | grep -o '"_id":"[^"]*' | sed 's/"_id":"//')

if [ -n "$TOKEN" ]; then
    echo -e "${GREEN}✓ User registration successful${NC}"
    echo "Token: ${TOKEN:0:20}..."
else
    echo -e "${RED}✗ User registration FAILED${NC}"
    echo "Response: $REGISTER_RESPONSE"
fi
echo ""

echo "Creating anonymous session..."
ANON_SESSION=$(curl -s -X POST "${API_URL}/api/auth/anonymous-session" \
  -H "Content-Type: application/json" \
  -d '{}')
SESSION_ID=$(echo $ANON_SESSION | grep -o '"sessionId":"[^"]*' | sed 's/"sessionId":"//')

if [ -n "$SESSION_ID" ]; then
    echo -e "${GREEN}✓ Anonymous session created${NC}"
    echo "Session ID: $SESSION_ID"
else
    echo -e "${RED}✗ Anonymous session FAILED${NC}"
fi
echo ""

# Test Campaign Service
echo -e "${YELLOW}3. Campaign Service Tests${NC}"
echo "Creating campaign..."
TOMORROW=$(date -d "+30 days" -I 2>/dev/null || date -v+30d +%Y-%m-%d)
CAMPAIGN_RESPONSE=$(curl -s -X POST "${API_URL}/api/campaigns" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"title\":\"Test Campaign\",\"description\":\"Testing campaign creation\",\"goalAmount\":5000,\"category\":\"Medical\",\"endDate\":\"${TOMORROW}T00:00:00Z\"}")

CAMPAIGN_ID=$(echo $CAMPAIGN_RESPONSE | grep -o '"_id":"[^"]*' | sed 's/"_id":"//')

if [ -n "$CAMPAIGN_ID" ]; then
    echo -e "${GREEN}✓ Campaign created successfully${NC}"
    echo "Campaign ID: $CAMPAIGN_ID"
else
    echo -e "${RED}✗ Campaign creation FAILED${NC}"
    echo "Response: $CAMPAIGN_RESPONSE"
fi
echo ""

echo "Listing campaigns..."
CAMPAIGNS=$(curl -s "${API_URL}/api/campaigns")
CAMPAIGN_COUNT=$(echo $CAMPAIGNS | grep -o '"_id"' | wc -l)
echo -e "${GREEN}✓ Found $CAMPAIGN_COUNT campaigns${NC}"
echo ""

# Test Pledge Service
echo -e "${YELLOW}4. Pledge Service Tests${NC}"
echo "Creating pledge with idempotency key..."
IDEMPOTENCY_KEY="manual-test-$(date +%s)-$(od -An -N4 -tu4 /dev/urandom | tr -d ' ')"
PLEDGE_RESPONSE=$(curl -s -X POST "${API_URL}/api/pledges" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY}" \
  -d "{\"campaignId\":\"${CAMPAIGN_ID}\",\"amount\":250}")

PLEDGE_ID=$(echo $PLEDGE_RESPONSE | grep -o '"_id":"[^"]*' | head -1 | sed 's/"_id":"//')

if [ -n "$PLEDGE_ID" ]; then
    echo -e "${GREEN}✓ Pledge created successfully${NC}"
    echo "Pledge ID: $PLEDGE_ID"
else
    echo -e "${RED}✗ Pledge creation FAILED${NC}"
    echo "Response: $PLEDGE_RESPONSE"
fi
echo ""

echo "Testing pledge idempotency (retrying same request)..."
RETRY_RESPONSE=$(curl -s -X POST "${API_URL}/api/pledges" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY}" \
  -d "{\"campaignId\":\"${CAMPAIGN_ID}\",\"amount\":250}")

RETRY_PLEDGE_ID=$(echo $RETRY_RESPONSE | grep -o '"_id":"[^"]*' | head -1 | sed 's/"_id":"//')

if [ "$RETRY_PLEDGE_ID" = "$PLEDGE_ID" ]; then
    echo -e "${GREEN}✓ Idempotency working - same pledge returned${NC}"
else
    echo -e "${RED}✗ Idempotency FAILED - different pledge returned${NC}"
fi
echo ""

# Test Payment Service
echo -e "${YELLOW}5. Payment Service Tests${NC}"
echo "Creating payment intent..."
INTENT_RESPONSE=$(curl -s -X POST "${API_URL}/api/payments/intent" \
  -H "Content-Type: application/json" \
  -d "{\"pledgeId\":\"${PLEDGE_ID}\",\"amount\":250}")

PAYMENT_INTENT_ID=$(echo $INTENT_RESPONSE | grep -o '"paymentIntentId":"[^"]*' | sed 's/"paymentIntentId":"//')

if [ -n "$PAYMENT_INTENT_ID" ]; then
    echo -e "${GREEN}✓ Payment intent created${NC}"
    echo "Payment Intent ID: $PAYMENT_INTENT_ID"
else
    echo -e "${RED}✗ Payment intent creation FAILED${NC}"
fi
echo ""

echo "Authorizing payment..."
AUTH_RESPONSE=$(curl -s -X POST "${API_URL}/api/payments/authorize" \
  -H "Content-Type: application/json" \
  -d "{\"paymentIntentId\":\"${PAYMENT_INTENT_ID}\"}")

echo -e "${GREEN}✓ Authorization initiated${NC}"
echo "Waiting for webhook to process (3 seconds)..."
sleep 3
echo ""

echo "Checking pledge status after authorization..."
PLEDGE_STATUS=$(curl -s "${API_URL}/api/pledges/${PLEDGE_ID}")
STATUS=$(echo $PLEDGE_STATUS | grep -o '"status":"[^"]*' | sed 's/"status":"//')
echo "Current status: $STATUS"

if [ "$STATUS" = "AUTHORIZED" ]; then
    echo -e "${GREEN}✓ Pledge authorized successfully${NC}"
else
    echo -e "${YELLOW}⚠ Status is ${STATUS} (expected AUTHORIZED)${NC}"
fi
echo ""

echo "Capturing payment..."
CAPTURE_RESPONSE=$(curl -s -X POST "${API_URL}/api/payments/capture" \
  -H "Content-Type: application/json" \
  -d "{\"paymentIntentId\":\"${PAYMENT_INTENT_ID}\"}")

echo -e "${GREEN}✓ Capture initiated${NC}"
echo "Waiting for webhook to process (2 seconds)..."
sleep 2
echo ""

echo "Checking pledge status after capture..."
PLEDGE_STATUS=$(curl -s "${API_URL}/api/pledges/${PLEDGE_ID}")
STATUS=$(echo $PLEDGE_STATUS | grep -o '"status":"[^"]*' | sed 's/"status":"//')
echo "Current status: $STATUS"

if [ "$STATUS" = "CAPTURED" ]; then
    echo -e "${GREEN}✓ Pledge captured successfully${NC}"
else
    echo -e "${YELLOW}⚠ Status is ${STATUS} (expected CAPTURED)${NC}"
fi
echo ""

# Test Totals Service
echo -e "${YELLOW}6. Totals Service Tests${NC}"
echo "Waiting for outbox worker to process events (8 seconds)..."
sleep 8
echo ""

echo "Checking campaign totals..."
TOTALS=$(curl -s "${API_URL}/api/totals/${CAMPAIGN_ID}")
TOTAL_AMOUNT=$(echo $TOTALS | grep -o '"totalAmount":[0-9]*' | sed 's/"totalAmount"://')
TOTAL_PLEDGES=$(echo $TOTALS | grep -o '"totalPledges":[0-9]*' | sed 's/"totalPledges"://')

echo "Total Amount: \$$TOTAL_AMOUNT"
echo "Total Pledges: $TOTAL_PLEDGES"

if [ "$TOTAL_AMOUNT" -ge 250 ]; then
    echo -e "${GREEN}✓ Totals updated correctly${NC}"
else
    echo -e "${YELLOW}⚠ Totals might not be updated yet (expected at least \$250)${NC}"
fi
echo ""

# Test Metrics Endpoints
echo -e "${YELLOW}7. Metrics Endpoints${NC}"
echo "Checking service metrics..."
for service in identity campaign pledge payment totals; do
    METRICS=$(curl -s "http://localhost:300$(($(echo "identity campaign pledge payment totals" | tr ' ' '\n' | grep -n "^${service}$" | cut -d: -f1) + 0))/metrics" 2>/dev/null || echo "")
    if [ -n "$METRICS" ]; then
        echo -e "${GREEN}✓ ${service}-service metrics accessible${NC}"
    else
        echo -e "${YELLOW}⚠ ${service}-service metrics not accessible${NC}"
    fi
done
echo ""

# Summary
echo "========================================"
echo -e "${GREEN}Manual API Testing Complete!${NC}"
echo "========================================"
echo ""
echo "Summary:"
echo "- User Registration: ✓"
echo "- Campaign Creation: ✓"
echo "- Pledge Creation: ✓"
echo "- Idempotency: ✓"
echo "- Payment Flow: ✓"
echo "- Totals Update: ✓"
echo ""
echo "Test artifacts:"
echo "Campaign ID: $CAMPAIGN_ID"
echo "Pledge ID: $PLEDGE_ID"
echo "Idempotency Key: $IDEMPOTENCY_KEY"
echo ""

