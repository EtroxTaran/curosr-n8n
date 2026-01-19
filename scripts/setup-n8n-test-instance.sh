#!/bin/bash
# =============================================================================
# n8n Test Instance Setup Script
# =============================================================================
# Sets up n8n with an owner user and API key for automated testing.
# This script is called from docker-compose to pre-configure n8n before tests.
#
# Usage:
#   ./scripts/setup-n8n-test-instance.sh [--wait-only]
#
# Options:
#   --wait-only  Only wait for n8n to be ready, skip owner setup
#
# Output:
#   Creates /tmp/n8n-test-api-key with the generated API key
#   Creates /tmp/n8n-test-credentials.json with full credentials
#
# Environment:
#   N8N_API_URL      - n8n API URL (default: http://localhost:5678)
#   N8N_TEST_EMAIL   - Owner email (default: test@example.com)
#   N8N_TEST_PASSWORD - Owner password (default: TestPassword123!)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[n8n-setup]${NC} $1"; }
log_success() { echo -e "${GREEN}[n8n-setup]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[n8n-setup]${NC} $1"; }
log_error() { echo -e "${RED}[n8n-setup]${NC} $1"; }

# Configuration
N8N_API_URL="${N8N_API_URL:-http://localhost:5678}"
N8N_TEST_EMAIL="${N8N_TEST_EMAIL:-test@example.com}"
N8N_TEST_PASSWORD="${N8N_TEST_PASSWORD:-TestPassword123!}"
N8N_TEST_FIRST_NAME="${N8N_TEST_FIRST_NAME:-Test}"
N8N_TEST_LAST_NAME="${N8N_TEST_LAST_NAME:-User}"

OUTPUT_DIR="/tmp"
API_KEY_FILE="${OUTPUT_DIR}/n8n-test-api-key"
CREDENTIALS_FILE="${OUTPUT_DIR}/n8n-test-credentials.json"

MAX_RETRIES=60
RETRY_INTERVAL=2

# Parse arguments
WAIT_ONLY=false
for arg in "$@"; do
    case $arg in
        --wait-only)
            WAIT_ONLY=true
            shift
            ;;
    esac
done

# =============================================================================
# Wait for n8n to be Ready
# =============================================================================

wait_for_n8n() {
    log_info "Waiting for n8n at ${N8N_API_URL}..."

    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -sf "${N8N_API_URL}/healthz" > /dev/null 2>&1; then
            log_success "n8n is ready!"
            return 0
        fi

        retries=$((retries + 1))
        if [ $((retries % 10)) -eq 0 ]; then
            log_info "Still waiting for n8n... (${retries}/${MAX_RETRIES})"
        fi
        sleep $RETRY_INTERVAL
    done

    log_error "n8n did not become ready in time"
    return 1
}

# =============================================================================
# Check if Owner Already Exists
# =============================================================================

check_owner_setup() {
    log_info "Checking n8n setup status..."

    # Try to access a protected endpoint
    local response
    response=$(curl -sf -w "\n%{http_code}" "${N8N_API_URL}/rest/settings" 2>/dev/null || echo "error")
    local http_code
    http_code=$(echo "$response" | tail -n1)

    case "$http_code" in
        200)
            log_info "n8n is already set up (owner exists)"
            return 0
            ;;
        401)
            log_info "n8n is set up but requires authentication"
            return 0
            ;;
        403)
            log_info "n8n owner setup required"
            return 1
            ;;
        *)
            log_info "Unable to determine setup status (HTTP $http_code), assuming setup needed"
            return 1
            ;;
    esac
}

# =============================================================================
# Create Owner Account
# =============================================================================

create_owner() {
    log_info "Creating owner account: ${N8N_TEST_EMAIL}"

    local response
    response=$(curl -sf -X POST "${N8N_API_URL}/rest/owner/setup" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"${N8N_TEST_EMAIL}\",
            \"password\": \"${N8N_TEST_PASSWORD}\",
            \"firstName\": \"${N8N_TEST_FIRST_NAME}\",
            \"lastName\": \"${N8N_TEST_LAST_NAME}\"
        }" 2>&1)

    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        log_success "Owner account created successfully"
        return 0
    else
        # Check if owner already exists
        if echo "$response" | grep -qi "instance.*already.*set.*up\|owner.*exists"; then
            log_info "Owner already exists, skipping creation"
            return 0
        fi
        log_error "Failed to create owner: $response"
        return 1
    fi
}

# =============================================================================
# Login and Get Session Cookie
# =============================================================================

login_and_get_cookie() {
    log_info "Logging in as ${N8N_TEST_EMAIL}..."

    local cookie_file
    cookie_file=$(mktemp)

    local response
    response=$(curl -sf -X POST "${N8N_API_URL}/rest/login" \
        -H "Content-Type: application/json" \
        -c "$cookie_file" \
        -d "{
            \"email\": \"${N8N_TEST_EMAIL}\",
            \"password\": \"${N8N_TEST_PASSWORD}\"
        }" 2>&1)

    if [ $? -eq 0 ]; then
        log_success "Login successful"
        echo "$cookie_file"
        return 0
    else
        log_error "Login failed: $response"
        rm -f "$cookie_file"
        return 1
    fi
}

# =============================================================================
# Create API Key
# =============================================================================

create_api_key() {
    local cookie_file="$1"

    log_info "Creating API key..."

    local response
    response=$(curl -sf -X POST "${N8N_API_URL}/rest/api-keys" \
        -H "Content-Type: application/json" \
        -b "$cookie_file" \
        -d "{
            \"label\": \"Test API Key $(date +%Y%m%d-%H%M%S)\"
        }" 2>&1)

    if [ $? -ne 0 ]; then
        log_error "Failed to create API key: $response"
        return 1
    fi

    # Extract the API key from response
    local api_key
    api_key=$(echo "$response" | grep -oP '"apiKey"\s*:\s*"\K[^"]+' || echo "")

    if [ -z "$api_key" ]; then
        log_error "Could not extract API key from response: $response"
        return 1
    fi

    log_success "API key created successfully"

    # Save API key to file
    echo "$api_key" > "$API_KEY_FILE"
    chmod 600 "$API_KEY_FILE"
    log_info "API key saved to $API_KEY_FILE"

    # Save full credentials to JSON file
    cat > "$CREDENTIALS_FILE" << EOF
{
    "apiUrl": "${N8N_API_URL}",
    "apiKey": "${api_key}",
    "email": "${N8N_TEST_EMAIL}",
    "password": "${N8N_TEST_PASSWORD}"
}
EOF
    chmod 600 "$CREDENTIALS_FILE"
    log_info "Full credentials saved to $CREDENTIALS_FILE"

    return 0
}

# =============================================================================
# Get Existing API Key
# =============================================================================

get_existing_api_key() {
    local cookie_file="$1"

    log_info "Checking for existing API keys..."

    local response
    response=$(curl -sf "${N8N_API_URL}/rest/api-keys" \
        -b "$cookie_file" 2>&1)

    if [ $? -ne 0 ]; then
        log_warn "Could not retrieve existing API keys"
        return 1
    fi

    # Check if there are any API keys
    local key_count
    key_count=$(echo "$response" | grep -oP '"id"' | wc -l)

    if [ "$key_count" -gt 0 ]; then
        log_info "Found $key_count existing API key(s)"
        # Note: We cannot retrieve the actual key value for existing keys
        # Need to create a new one
        return 1
    fi

    return 1
}

# =============================================================================
# Verify API Key Works
# =============================================================================

verify_api_key() {
    local api_key
    api_key=$(cat "$API_KEY_FILE" 2>/dev/null)

    if [ -z "$api_key" ]; then
        log_error "No API key found in $API_KEY_FILE"
        return 1
    fi

    log_info "Verifying API key..."

    local response
    response=$(curl -sf "${N8N_API_URL}/api/v1/workflows?limit=1" \
        -H "X-N8N-API-KEY: ${api_key}" 2>&1)

    if [ $? -eq 0 ]; then
        log_success "API key verification successful!"
        return 0
    else
        log_error "API key verification failed: $response"
        return 1
    fi
}

# =============================================================================
# Main Entry Point
# =============================================================================

main() {
    echo ""
    echo "============================================================"
    echo "  n8n Test Instance Setup"
    echo "============================================================"
    echo ""
    echo "  n8n URL:    ${N8N_API_URL}"
    echo "  Test Email: ${N8N_TEST_EMAIL}"
    echo "  Wait Only:  ${WAIT_ONLY}"
    echo ""

    # Step 1: Wait for n8n to be ready
    wait_for_n8n || exit 1

    if [ "$WAIT_ONLY" = true ]; then
        log_success "n8n is ready (wait-only mode)"
        exit 0
    fi

    # Step 2: Check if already set up
    local needs_setup=false
    if ! check_owner_setup; then
        needs_setup=true
    fi

    # Step 3: Create owner if needed
    if [ "$needs_setup" = true ]; then
        create_owner || exit 1
        # Wait a moment for n8n to process
        sleep 2
    fi

    # Step 4: Login and get session cookie
    local cookie_file
    cookie_file=$(login_and_get_cookie) || exit 1

    # Step 5: Create API key
    if ! get_existing_api_key "$cookie_file"; then
        create_api_key "$cookie_file" || {
            rm -f "$cookie_file"
            exit 1
        }
    fi

    # Cleanup cookie file
    rm -f "$cookie_file"

    # Step 6: Verify API key works
    verify_api_key || exit 1

    echo ""
    echo "============================================================"
    echo "  Setup Complete!"
    echo "============================================================"
    echo ""
    echo "  API Key File: $API_KEY_FILE"
    echo "  Credentials:  $CREDENTIALS_FILE"
    echo ""
    echo "  Usage:"
    echo "    export N8N_API_KEY=\$(cat $API_KEY_FILE)"
    echo "    npm run test:integration"
    echo ""

    exit 0
}

main "$@"
