#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     AI Product Factory - Integration Test Suite             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up test environment...${NC}"
    docker compose -f docker-compose.test.yml down -v --remove-orphans 2>/dev/null || true
}

# Trap for cleanup on exit
trap cleanup EXIT

# Step 1: Check dependencies
echo -e "\n${YELLOW}[1/6] Checking dependencies...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Dependencies OK${NC}"

# Step 2: Stop any existing test containers
echo -e "\n${YELLOW}[2/6] Stopping any existing test containers...${NC}"
docker compose -f docker-compose.test.yml down -v --remove-orphans 2>/dev/null || true
echo -e "${GREEN}✓ Cleanup complete${NC}"

# Step 3: Start test services
echo -e "\n${YELLOW}[3/6] Starting test services...${NC}"
docker compose -f docker-compose.test.yml up -d

# Step 4: Wait for services to be healthy
echo -e "\n${YELLOW}[4/6] Waiting for services to be healthy...${NC}"

# Wait for PostgreSQL
echo -n "  PostgreSQL: "
for i in {1..30}; do
    if docker compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U n8n -d n8n > /dev/null 2>&1; then
        echo -e "${GREEN}Ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}Timeout${NC}"
        echo -e "${RED}Error: PostgreSQL failed to start${NC}"
        docker compose -f docker-compose.test.yml logs postgres-test
        exit 1
    fi
    sleep 2
done

# Wait for SeaweedFS
echo -n "  SeaweedFS:  "
for i in {1..30}; do
    if curl -s http://localhost:8888/status > /dev/null 2>&1; then
        echo -e "${GREEN}Ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}Timeout${NC}"
        echo -e "${RED}Error: SeaweedFS failed to start${NC}"
        docker compose -f docker-compose.test.yml logs seaweedfs-test
        exit 1
    fi
    sleep 2
done

# Wait for n8n
echo -n "  n8n:        "
for i in {1..60}; do
    if curl -s http://localhost:5678/healthz > /dev/null 2>&1; then
        echo -e "${GREEN}Ready${NC}"
        break
    fi
    if [ $i -eq 60 ]; then
        echo -e "${YELLOW}Timeout (continuing anyway)${NC}"
        break
    fi
    sleep 2
done

echo -e "${GREEN}✓ All services ready${NC}"

# Step 5: Run backend tests
echo -e "\n${YELLOW}[5/6] Running backend tests...${NC}"
BACKEND_RESULT=0
npm run test:backend || BACKEND_RESULT=$?

if [ $BACKEND_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ Backend tests passed${NC}"
else
    echo -e "${RED}✗ Backend tests failed${NC}"
fi

# Step 6: Run frontend tests
echo -e "\n${YELLOW}[6/6] Running frontend tests...${NC}"
FRONTEND_RESULT=0
npm run test:frontend || FRONTEND_RESULT=$?

if [ $FRONTEND_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ Frontend tests passed${NC}"
else
    echo -e "${RED}✗ Frontend tests failed${NC}"
fi

# Summary
echo -e "\n${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                     Test Summary                             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

if [ $BACKEND_RESULT -eq 0 ] && [ $FRONTEND_RESULT -eq 0 ]; then
    echo -e "${GREEN}  All tests passed! ✓${NC}"
    EXIT_CODE=0
else
    echo -e "${RED}  Some tests failed:${NC}"
    [ $BACKEND_RESULT -ne 0 ] && echo -e "    ${RED}✗ Backend tests${NC}"
    [ $FRONTEND_RESULT -ne 0 ] && echo -e "    ${RED}✗ Frontend tests${NC}"
    EXIT_CODE=1
fi

echo ""
exit $EXIT_CODE
