#!/bin/bash
# ============================================
# AI Product Factory - Environment Validation
# ============================================
# This script validates that all required environment variables are set
# Run before starting Docker Compose to catch configuration issues early
#
# Usage:
#   ./scripts/validate-env.sh
#   ./scripts/validate-env.sh --strict  # Exit on first error

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track errors
ERRORS=0
WARNINGS=0
STRICT_MODE=false

# Parse arguments
if [[ "$1" == "--strict" ]]; then
    STRICT_MODE=true
fi

# ============================================
# Helper functions
# ============================================

check_required() {
    local var_name=$1
    local description=$2

    if [[ -z "${!var_name}" ]]; then
        echo -e "${RED}ERROR:${NC} $var_name is required but not set"
        echo -e "       $description"
        ((ERRORS++))
        if $STRICT_MODE; then
            exit 1
        fi
    else
        echo -e "${GREEN}  OK:${NC} $var_name is set"
    fi
}

check_optional() {
    local var_name=$1
    local description=$2

    if [[ -z "${!var_name}" ]]; then
        echo -e "${YELLOW}WARN:${NC} $var_name is not set (optional)"
        echo -e "       $description"
        ((WARNINGS++))
    else
        echo -e "${GREEN}  OK:${NC} $var_name is set"
    fi
}

check_length() {
    local var_name=$1
    local min_length=$2
    local description=$3

    local value="${!var_name}"
    if [[ -n "$value" && ${#value} -lt $min_length ]]; then
        echo -e "${RED}ERROR:${NC} $var_name must be at least $min_length characters"
        echo -e "       Current length: ${#value}"
        ((ERRORS++))
    fi
}

check_url() {
    local var_name=$1
    local value="${!var_name}"

    if [[ -n "$value" && ! "$value" =~ ^https?:// ]]; then
        echo -e "${YELLOW}WARN:${NC} $var_name should be a valid URL (http:// or https://)"
        ((WARNINGS++))
    fi
}

# ============================================
# Main validation
# ============================================

echo ""
echo "============================================"
echo " AI Product Factory - Environment Validation"
echo "============================================"
echo ""

# Load .env file if it exists
if [[ -f ".env" ]]; then
    echo -e "${GREEN}Loading .env file...${NC}"
    set -a
    source .env
    set +a
    echo ""
else
    echo -e "${YELLOW}No .env file found. Using existing environment variables.${NC}"
    echo ""
fi

# --- Critical Security Variables ---
echo "--- Critical Security Variables ---"
check_required "POSTGRES_PASSWORD" "PostgreSQL database password"
check_length "POSTGRES_PASSWORD" 12 "Password should be at least 12 characters for security"

check_required "N8N_ENCRYPTION_KEY" "n8n encryption key for sensitive data"
check_length "N8N_ENCRYPTION_KEY" 32 "Key should be at least 32 characters"

check_required "REDIS_PASSWORD" "Redis authentication password"
check_length "REDIS_PASSWORD" 12 "Password should be at least 12 characters for security"

check_required "QDRANT_API_KEY" "Qdrant vector database API key"

check_required "AUTH_SECRET" "Better-Auth secret for session encryption"
check_length "AUTH_SECRET" 32 "Secret should be at least 32 characters"

echo ""

# --- API Keys ---
echo "--- API Keys ---"
check_required "OPENAI_API_KEY" "OpenAI API key for Graphiti knowledge graph"
check_required "GOOGLE_CLIENT_ID" "Google OAuth client ID for authentication"
check_required "GOOGLE_CLIENT_SECRET" "Google OAuth client secret"

echo ""

# --- S3/SeaweedFS Configuration ---
echo "--- S3/SeaweedFS Configuration ---"
check_required "S3_ACCESS_KEY" "S3 access key for artifact storage"
check_required "S3_SECRET_KEY" "S3 secret key for artifact storage"
check_length "S3_SECRET_KEY" 16 "Secret key should be at least 16 characters"
check_optional "S3_BUCKET" "S3 bucket name (defaults to product-factory-artifacts)"

echo ""

# --- Domain & Network Configuration ---
echo "--- Domain & Network Configuration ---"
check_required "DOMAIN_NAME" "Primary domain for n8n (e.g., n8n.example.com)"
check_required "ACME_EMAIL" "Email for Let's Encrypt SSL certificates"
check_optional "ALLOWED_EMAIL_DOMAINS" "Comma-separated list of allowed email domains for auth"

echo ""

# --- Database Configuration ---
echo "--- Database Configuration ---"
check_optional "POSTGRES_USER" "PostgreSQL username (defaults to n8n)"
check_optional "POSTGRES_DB" "PostgreSQL database name (defaults to n8n)"
check_optional "TIMEZONE" "Server timezone (defaults to UTC)"

echo ""

# --- Optional CI/CD Configuration ---
echo "--- CI/CD Configuration (optional) ---"
check_optional "N8N_API_URL" "n8n API URL for workflow sync"
check_url "N8N_API_URL"
check_optional "N8N_API_KEY" "n8n API key for workflow sync"
check_optional "DASHBOARD_URL" "Dashboard URL for health checks"
check_url "DASHBOARD_URL"
check_optional "DOKPLOY_WEBHOOK_URL" "Dokploy webhook for auto-deploy"

echo ""

# --- Summary ---
echo "============================================"
echo " Validation Summary"
echo "============================================"

if [[ $ERRORS -gt 0 ]]; then
    echo -e "${RED}FAILED:${NC} $ERRORS critical error(s) found"
    echo ""
    echo "Please fix the errors above before starting the application."
    echo "Copy .env.example to .env and fill in the required values."
    exit 1
fi

if [[ $WARNINGS -gt 0 ]]; then
    echo -e "${YELLOW}PASSED WITH WARNINGS:${NC} $WARNINGS warning(s) found"
    echo ""
    echo "The application may work but some features might be limited."
else
    echo -e "${GREEN}PASSED:${NC} All required environment variables are set"
fi

echo ""
echo "To generate secure random values, use:"
echo "  openssl rand -base64 32"
echo ""

exit 0
