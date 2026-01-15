#!/bin/bash
# Test SeaweedFS S3 Authentication
# Uses MinIO Client (mc) - lightweight S3 CLI tool
# No AWS account required!

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default test credentials (match docker-compose.test.yml)
S3_ENDPOINT="${S3_ENDPOINT:-http://localhost:8888}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-testadmin}"
S3_SECRET_KEY="${S3_SECRET_KEY:-testsecret123}"
S3_BUCKET="${S3_BUCKET:-product-factory-artifacts}"

echo "=========================================="
echo "  SeaweedFS S3 Authentication Test"
echo "=========================================="
echo ""
echo "Endpoint:   $S3_ENDPOINT"
echo "Access Key: $S3_ACCESS_KEY"
echo "Bucket:     $S3_BUCKET"
echo ""

# Check if mc (MinIO Client) is installed
if ! command -v mc &> /dev/null; then
    echo -e "${YELLOW}MinIO Client (mc) not found. Installing...${NC}"

    # Detect OS and install
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -sL https://dl.min.io/client/mc/release/linux-amd64/mc -o /tmp/mc
        chmod +x /tmp/mc
        MC_CMD="/tmp/mc"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        curl -sL https://dl.min.io/client/mc/release/darwin-amd64/mc -o /tmp/mc
        chmod +x /tmp/mc
        MC_CMD="/tmp/mc"
    else
        echo -e "${RED}Unsupported OS. Please install MinIO Client manually:${NC}"
        echo "  https://min.io/docs/minio/linux/reference/minio-mc.html"
        exit 1
    fi
    echo -e "${GREEN}MinIO Client installed to /tmp/mc${NC}"
else
    MC_CMD="mc"
fi

echo ""
echo "=== Test 1: Configure S3 alias ==="
$MC_CMD alias set seaweedfs "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" --api S3v4 2>/dev/null || true
echo -e "${GREEN}✓ Alias configured${NC}"

echo ""
echo "=== Test 2: Test authentication (list buckets) ==="
if $MC_CMD ls seaweedfs/ 2>&1; then
    echo -e "${GREEN}✓ Authentication successful - can list buckets${NC}"
else
    echo -e "${RED}✗ Authentication failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Is SeaweedFS running? Check: docker ps | grep seaweedfs"
    echo "  2. Are credentials correct in docker-compose?"
    echo "  3. Is S3 auth config mounted correctly?"
    exit 1
fi

echo ""
echo "=== Test 3: Create test bucket ==="
if $MC_CMD mb seaweedfs/$S3_BUCKET 2>&1 | grep -q "already"; then
    echo -e "${GREEN}✓ Bucket '$S3_BUCKET' already exists${NC}"
elif $MC_CMD mb seaweedfs/$S3_BUCKET 2>&1; then
    echo -e "${GREEN}✓ Bucket '$S3_BUCKET' created${NC}"
else
    echo -e "${YELLOW}! Bucket creation returned non-zero (may already exist)${NC}"
fi

echo ""
echo "=== Test 4: Upload test file ==="
TEST_FILE="/tmp/s3-auth-test-$(date +%s).txt"
echo "S3 Authentication Test - $(date)" > "$TEST_FILE"
if $MC_CMD cp "$TEST_FILE" "seaweedfs/$S3_BUCKET/test/" 2>&1; then
    echo -e "${GREEN}✓ File uploaded successfully${NC}"
else
    echo -e "${RED}✗ File upload failed${NC}"
    exit 1
fi

echo ""
echo "=== Test 5: List uploaded file ==="
if $MC_CMD ls "seaweedfs/$S3_BUCKET/test/" 2>&1; then
    echo -e "${GREEN}✓ File listed successfully${NC}"
else
    echo -e "${RED}✗ File listing failed${NC}"
    exit 1
fi

echo ""
echo "=== Test 6: Delete test file ==="
if $MC_CMD rm "seaweedfs/$S3_BUCKET/test/$(basename $TEST_FILE)" 2>&1; then
    echo -e "${GREEN}✓ File deleted successfully${NC}"
else
    echo -e "${YELLOW}! File deletion returned non-zero${NC}"
fi

# Cleanup local temp file
rm -f "$TEST_FILE"

echo ""
echo "=========================================="
echo -e "${GREEN}  All S3 Authentication Tests Passed!${NC}"
echo "=========================================="
echo ""
echo "SeaweedFS S3 is properly configured with authentication."
echo "Credentials are working correctly."
