#!/bin/bash
# =============================================================================
# AI Product Factory - Production Parity Test Suite
# =============================================================================
# Complete test suite that validates the system in a production-like environment.
# Catches issues that would occur in production but not in unit tests:
# - "tags is read-only" errors during workflow import
# - "workflow not published" errors during activation
# - Database migration issues
# - Service communication problems
#
# Usage:
#   ./scripts/run-prod-parity-tests.sh [OPTIONS]
#
# Options:
#   --skip-build      Skip building Docker images
#   --skip-e2e        Skip Playwright E2E tests
#   --keep-running    Don't stop services after tests
#   --quick           Skip slow tests (Graphiti, full E2E)
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="docker-compose.local-prod.yml"
LOG_FILE="/tmp/prod-parity-tests-$(date +%Y%m%d-%H%M%S).log"

# Parse arguments
SKIP_BUILD=false
SKIP_E2E=false
KEEP_RUNNING=false
QUICK_MODE=false

for arg in "$@"; do
    case $arg in
        --skip-build)
            SKIP_BUILD=true
            ;;
        --skip-e2e)
            SKIP_E2E=true
            ;;
        --keep-running)
            KEEP_RUNNING=true
            ;;
        --quick)
            QUICK_MODE=true
            SKIP_E2E=true
            ;;
        --help)
            echo "Usage: $0 [--skip-build] [--skip-e2e] [--keep-running] [--quick]"
            exit 0
            ;;
    esac
done

cd "$PROJECT_ROOT"

# Logging
log_info() { echo -e "${BLUE}[test]${NC} $1" | tee -a "$LOG_FILE"; }
log_success() { echo -e "${GREEN}[test]${NC} $1" | tee -a "$LOG_FILE"; }
log_warn() { echo -e "${YELLOW}[test]${NC} $1" | tee -a "$LOG_FILE"; }
log_error() { echo -e "${RED}[test]${NC} $1" | tee -a "$LOG_FILE"; }
log_header() {
    echo "" | tee -a "$LOG_FILE"
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}" | tee -a "$LOG_FILE"
    echo -e "${CYAN}║${NC}  ${BOLD}$1${NC}" | tee -a "$LOG_FILE"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}" | tee -a "$LOG_FILE"
}

# Track test results
declare -a PASSED_TESTS=()
declare -a FAILED_TESTS=()
declare -a SKIPPED_TESTS=()

record_pass() { PASSED_TESTS+=("$1"); log_success "PASS: $1"; }
record_fail() { FAILED_TESTS+=("$1"); log_error "FAIL: $1"; }
record_skip() { SKIPPED_TESTS+=("$1"); log_warn "SKIP: $1"; }

# =============================================================================
# Cleanup Handler
# =============================================================================

cleanup() {
    local exit_code=$?

    echo "" | tee -a "$LOG_FILE"

    if [ "$KEEP_RUNNING" = true ]; then
        log_warn "Services kept running (--keep-running flag)"
        log_info "Stop with: docker compose -f $COMPOSE_FILE down -v"
    else
        log_info "Cleaning up Docker environment..."
        docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
    fi

    # Print summary
    print_summary

    exit $exit_code
}

trap cleanup EXIT

# =============================================================================
# Print Summary
# =============================================================================

print_summary() {
    log_header "Test Results Summary"

    echo "" | tee -a "$LOG_FILE"
    echo -e "  ${GREEN}Passed:${NC}  ${#PASSED_TESTS[@]}" | tee -a "$LOG_FILE"
    echo -e "  ${RED}Failed:${NC}  ${#FAILED_TESTS[@]}" | tee -a "$LOG_FILE"
    echo -e "  ${YELLOW}Skipped:${NC} ${#SKIPPED_TESTS[@]}" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"

    if [ ${#PASSED_TESTS[@]} -gt 0 ]; then
        echo -e "  ${GREEN}Passed Tests:${NC}" | tee -a "$LOG_FILE"
        for test in "${PASSED_TESTS[@]}"; do
            echo -e "    ${GREEN}✓${NC} $test" | tee -a "$LOG_FILE"
        done
    fi

    if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
        echo "" | tee -a "$LOG_FILE"
        echo -e "  ${RED}Failed Tests:${NC}" | tee -a "$LOG_FILE"
        for test in "${FAILED_TESTS[@]}"; do
            echo -e "    ${RED}✗${NC} $test" | tee -a "$LOG_FILE"
        done
    fi

    if [ ${#SKIPPED_TESTS[@]} -gt 0 ]; then
        echo "" | tee -a "$LOG_FILE"
        echo -e "  ${YELLOW}Skipped Tests:${NC}" | tee -a "$LOG_FILE"
        for test in "${SKIPPED_TESTS[@]}"; do
            echo -e "    ${YELLOW}○${NC} $test" | tee -a "$LOG_FILE"
        done
    fi

    echo "" | tee -a "$LOG_FILE"
    echo -e "  Log file: ${CYAN}$LOG_FILE${NC}" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
}

# =============================================================================
# Main Test Phases
# =============================================================================

phase_1_setup() {
    log_header "Phase 1: Environment Setup"

    # Stop any existing services
    log_info "Stopping existing services..."
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true

    # Start services
    log_info "Starting production-parity environment..."

    local build_flag=""
    if [ "$SKIP_BUILD" = true ]; then
        log_info "Skipping build (--skip-build)"
        build_flag="--no-build"
    else
        build_flag="--build"
    fi

    if docker compose -f "$COMPOSE_FILE" up -d $build_flag 2>&1 | tee -a "$LOG_FILE"; then
        record_pass "Docker Compose startup"
    else
        record_fail "Docker Compose startup"
        return 1
    fi

    # Wait for services
    log_info "Waiting for services to be healthy..."

    local wait_args=""
    if [ "$QUICK_MODE" = true ]; then
        wait_args="--skip-graphiti"
    fi

    if ./scripts/wait-for-services.sh $wait_args 2>&1 | tee -a "$LOG_FILE"; then
        record_pass "Service health checks"
    else
        record_fail "Service health checks"
        return 1
    fi
}

phase_2_n8n_setup() {
    log_header "Phase 2: n8n Owner Setup & API Key Generation"

    log_info "Setting up n8n test instance..."

    if ./scripts/setup-n8n-test-instance.sh 2>&1 | tee -a "$LOG_FILE"; then
        record_pass "n8n owner setup"
    else
        record_fail "n8n owner setup"
        return 1
    fi

    # Export API key for subsequent tests
    if [ -f /tmp/n8n-test-api-key ]; then
        export N8N_API_KEY=$(cat /tmp/n8n-test-api-key)
        export N8N_API_URL="http://localhost:5678"
        log_success "API key exported to environment"
        record_pass "API key generation"
    else
        record_fail "API key generation"
        return 1
    fi
}

phase_3_workflow_tests() {
    log_header "Phase 3: Workflow Validation Tests"

    log_info "Running workflow structure tests..."

    if npm run test:workflows 2>&1 | tee -a "$LOG_FILE"; then
        record_pass "Workflow structure validation"
    else
        record_fail "Workflow structure validation"
        # Continue despite failure - want to see all results
    fi

    log_info "Running workflow import integration tests..."

    if npm run test:workflows:integration 2>&1 | tee -a "$LOG_FILE"; then
        record_pass "Workflow import integration"
    else
        record_fail "Workflow import integration"
    fi
}

phase_4_integration_tests() {
    log_header "Phase 4: Backend Integration Tests"

    log_info "Running integration test suite..."

    # Export environment variables for tests
    export DATABASE_URL="postgresql://n8n:n8n_test_password@localhost:5432/dashboard"
    export S3_ENDPOINT="http://localhost:8888"
    export S3_ACCESS_KEY="admin"
    export S3_SECRET_KEY="admin123"

    if npm run test:integration 2>&1 | tee -a "$LOG_FILE"; then
        record_pass "Backend integration tests"
    else
        record_fail "Backend integration tests"
    fi
}

phase_5_frontend_tests() {
    log_header "Phase 5: Frontend Tests"

    log_info "Running frontend unit tests..."

    if npm run test:frontend 2>&1 | tee -a "$LOG_FILE"; then
        record_pass "Frontend unit tests"
    else
        record_fail "Frontend unit tests"
    fi
}

phase_6_e2e_tests() {
    log_header "Phase 6: End-to-End Tests (Playwright)"

    if [ "$SKIP_E2E" = true ]; then
        record_skip "Playwright E2E tests (--skip-e2e)"
        return 0
    fi

    log_info "Running Playwright E2E tests..."

    cd frontend

    # Install Playwright browsers if needed
    if ! npx playwright --version &>/dev/null; then
        log_info "Installing Playwright..."
        npm install @playwright/test 2>&1 | tee -a "$LOG_FILE"
        npx playwright install chromium 2>&1 | tee -a "$LOG_FILE"
    fi

    # Run E2E tests against local-prod environment
    export DASHBOARD_URL="http://dashboard.localhost"
    export N8N_API_URL="http://n8n.localhost"
    export CI=true  # Disable webServer auto-start

    if npx playwright test 2>&1 | tee -a "$LOG_FILE"; then
        record_pass "Playwright E2E tests"
    else
        record_fail "Playwright E2E tests"
    fi

    cd "$PROJECT_ROOT"
}

phase_7_production_parity() {
    log_header "Phase 7: Production Parity Validation"

    log_info "Running production parity checks..."

    # Use the existing validation script with --keep-running since we're still running
    if ./scripts/validate-production-parity.sh --skip-build --keep-running 2>&1 | tee -a "$LOG_FILE"; then
        record_pass "Production parity validation"
    else
        # Validation warnings are ok, only fail on errors
        if [ ${PIPESTATUS[0]} -eq 0 ]; then
            record_pass "Production parity validation (with warnings)"
        else
            record_fail "Production parity validation"
        fi
    fi
}

# =============================================================================
# Main Entry Point
# =============================================================================

main() {
    log_header "AI Product Factory - Production Parity Test Suite"

    echo "" | tee -a "$LOG_FILE"
    echo -e "  ${BOLD}Configuration:${NC}" | tee -a "$LOG_FILE"
    echo -e "    Compose file:   ${CYAN}$COMPOSE_FILE${NC}" | tee -a "$LOG_FILE"
    echo -e "    Skip build:     ${CYAN}$SKIP_BUILD${NC}" | tee -a "$LOG_FILE"
    echo -e "    Skip E2E:       ${CYAN}$SKIP_E2E${NC}" | tee -a "$LOG_FILE"
    echo -e "    Quick mode:     ${CYAN}$QUICK_MODE${NC}" | tee -a "$LOG_FILE"
    echo -e "    Keep running:   ${CYAN}$KEEP_RUNNING${NC}" | tee -a "$LOG_FILE"
    echo -e "    Log file:       ${CYAN}$LOG_FILE${NC}" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"

    local start_time
    start_time=$(date +%s)

    # Run all phases
    phase_1_setup || log_error "Phase 1 failed - continuing..."
    phase_2_n8n_setup || log_error "Phase 2 failed - continuing..."
    phase_3_workflow_tests || log_error "Phase 3 failed - continuing..."
    phase_4_integration_tests || log_error "Phase 4 failed - continuing..."
    phase_5_frontend_tests || log_error "Phase 5 failed - continuing..."
    phase_6_e2e_tests || log_error "Phase 6 failed - continuing..."
    phase_7_production_parity || log_error "Phase 7 failed - continuing..."

    local end_time
    end_time=$(date +%s)
    local total_time=$((end_time - start_time))

    log_info "Total test time: ${total_time}s"

    # Determine exit code
    if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

main "$@"
