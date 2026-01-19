#!/bin/bash
# =============================================================================
# AI Product Factory - Service Health Check Wait Script
# =============================================================================
# Waits for all services in the production-parity environment to be healthy.
# Used by CI/CD and test scripts before running integration/E2E tests.
#
# Usage:
#   ./scripts/wait-for-services.sh [--compose-file FILE] [--timeout SECONDS]
#
# Options:
#   --compose-file FILE   Docker Compose file (default: docker-compose.local-prod.yml)
#   --timeout SECONDS     Maximum wait time in seconds (default: 300)
#   --skip-graphiti       Skip waiting for Graphiti (faster for workflow tests)
#   --quiet               Suppress progress output
#
# Exit codes:
#   0 - All services are healthy
#   1 - Timeout waiting for services
#   2 - Docker/Docker Compose not available
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default configuration
COMPOSE_FILE="docker-compose.local-prod.yml"
TIMEOUT=300
SKIP_GRAPHITI=false
QUIET=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --compose-file)
            COMPOSE_FILE="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --skip-graphiti)
            SKIP_GRAPHITI=true
            shift
            ;;
        --quiet)
            QUIET=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Logging functions
log() {
    if [ "$QUIET" = false ]; then
        echo -e "$1"
    fi
}

log_info() { log "${BLUE}[wait]${NC} $1"; }
log_success() { log "${GREEN}[wait]${NC} $1"; }
log_warn() { log "${YELLOW}[wait]${NC} $1"; }
log_error() { log "${RED}[wait]${NC} $1"; }

# =============================================================================
# Service Definitions
# =============================================================================
# Each service has: name, check_command, timeout_seconds, interval_seconds

declare -A SERVICES=(
    ["postgres"]="pg_isready -U n8n -d n8n|30|2"
    ["redis"]="redis-cli ping|20|2"
    ["qdrant"]="bash -c '(echo > /dev/tcp/localhost/6333)'|30|2"
    ["falkordb"]="redis-cli ping|20|2"
    ["seaweedfs"]="wget -qO- http://127.0.0.1:9333/cluster/status|30|2"
    ["n8n"]="wget -qO- http://127.0.0.1:5678/healthz|60|3"
    ["frontend"]="wget -qO- http://127.0.0.1:3000/api/health|60|3"
    ["traefik"]="wget -qO- http://127.0.0.1:8080/ping|20|2"
)

# Services that take longer and are optional
declare -A SLOW_SERVICES=(
    ["graphiti"]="curl -sf http://127.0.0.1:8000/health|120|5"
)

# =============================================================================
# Wait for Single Service
# =============================================================================

wait_for_service() {
    local service_name="$1"
    local check_cmd="$2"
    local max_wait="$3"
    local interval="$4"

    local elapsed=0
    local dots=""

    while [ $elapsed -lt $max_wait ]; do
        # Execute health check inside container
        if docker compose -f "$COMPOSE_FILE" exec -T "$service_name" sh -c "$check_cmd" > /dev/null 2>&1; then
            log_success "$service_name is ready (${elapsed}s)"
            return 0
        fi

        elapsed=$((elapsed + interval))
        dots="${dots}."

        if [ $((elapsed % 10)) -eq 0 ] && [ "$QUIET" = false ]; then
            echo -ne "\r${BLUE}[wait]${NC} Waiting for $service_name${dots} (${elapsed}s/${max_wait}s)"
        fi

        sleep $interval
    done

    log_error "$service_name timed out after ${max_wait}s"
    return 1
}

# =============================================================================
# Wait for External URL (for Traefik routing)
# =============================================================================

wait_for_url() {
    local name="$1"
    local url="$2"
    local max_wait="$3"
    local interval="$4"

    local elapsed=0

    while [ $elapsed -lt $max_wait ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            log_success "$name is accessible ($url) (${elapsed}s)"
            return 0
        fi

        elapsed=$((elapsed + interval))
        sleep $interval
    done

    log_warn "$name may not be accessible at $url (timeout: ${max_wait}s)"
    return 1
}

# =============================================================================
# Main Script
# =============================================================================

main() {
    local start_time
    start_time=$(date +%s)

    log ""
    log "============================================================"
    log "  AI Product Factory - Service Health Check"
    log "============================================================"
    log ""
    log_info "Compose file: $COMPOSE_FILE"
    log_info "Timeout: ${TIMEOUT}s"
    log_info "Skip Graphiti: $SKIP_GRAPHITI"
    log ""

    # Check Docker availability
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 2
    fi

    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available"
        exit 2
    fi

    # Check compose file exists
    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "Compose file not found: $COMPOSE_FILE"
        exit 2
    fi

    local failed_services=()

    # Phase 1: Core infrastructure services
    log_info "Phase 1: Waiting for core infrastructure..."
    log ""

    for service in postgres redis; do
        IFS='|' read -r check_cmd max_wait interval <<< "${SERVICES[$service]}"
        echo -ne "\r"
        if ! wait_for_service "$service" "$check_cmd" "$max_wait" "$interval"; then
            failed_services+=("$service")
        fi
    done

    # Phase 2: Data services
    log ""
    log_info "Phase 2: Waiting for data services..."
    log ""

    for service in qdrant falkordb seaweedfs; do
        IFS='|' read -r check_cmd max_wait interval <<< "${SERVICES[$service]}"
        echo -ne "\r"
        if ! wait_for_service "$service" "$check_cmd" "$max_wait" "$interval"; then
            failed_services+=("$service")
        fi
    done

    # Phase 3: Slow services (optional)
    if [ "$SKIP_GRAPHITI" = false ]; then
        log ""
        log_info "Phase 3: Waiting for slow services (this may take a while)..."
        log ""

        for service in "${!SLOW_SERVICES[@]}"; do
            IFS='|' read -r check_cmd max_wait interval <<< "${SLOW_SERVICES[$service]}"
            echo -ne "\r"
            if ! wait_for_service "$service" "$check_cmd" "$max_wait" "$interval"; then
                # Graphiti is optional for many tests
                log_warn "Graphiti not ready - some tests may be skipped"
            fi
        done
    else
        log ""
        log_info "Phase 3: Skipping Graphiti (--skip-graphiti flag)"
    fi

    # Phase 4: Application services
    log ""
    log_info "Phase 4: Waiting for application services..."
    log ""

    for service in n8n traefik; do
        IFS='|' read -r check_cmd max_wait interval <<< "${SERVICES[$service]}"
        echo -ne "\r"
        if ! wait_for_service "$service" "$check_cmd" "$max_wait" "$interval"; then
            failed_services+=("$service")
        fi
    done

    # Frontend depends on migration completion
    log_info "Waiting for frontend (depends on database migration)..."
    IFS='|' read -r check_cmd max_wait interval <<< "${SERVICES[frontend]}"
    if ! wait_for_service "frontend" "$check_cmd" "$max_wait" "$interval"; then
        failed_services+=("frontend")
    fi

    # Phase 5: Traefik routing verification
    log ""
    log_info "Phase 5: Verifying Traefik routing..."
    log ""

    # These use external URLs through Traefik
    wait_for_url "n8n (via Traefik)" "http://n8n.localhost/healthz" 30 2 || true
    wait_for_url "Dashboard (via Traefik)" "http://dashboard.localhost/api/health" 30 2 || true

    # Calculate elapsed time
    local end_time
    end_time=$(date +%s)
    local total_time=$((end_time - start_time))

    # Summary
    log ""
    log "============================================================"
    log "  Summary"
    log "============================================================"
    log ""
    log_info "Total time: ${total_time}s"

    if [ ${#failed_services[@]} -eq 0 ]; then
        log_success "All services are healthy!"
        log ""
        log "  Access Points:"
        log "    - Dashboard:  ${GREEN}http://dashboard.localhost${NC}"
        log "    - n8n:        ${GREEN}http://n8n.localhost${NC}"
        log "    - S3:         ${GREEN}http://s3.localhost${NC}"
        log "    - Traefik:    ${GREEN}http://localhost:8080${NC}"
        log ""
        exit 0
    else
        log_error "Failed services: ${failed_services[*]}"
        log ""
        log "  Debug commands:"
        log "    docker compose -f $COMPOSE_FILE ps"
        log "    docker compose -f $COMPOSE_FILE logs <service>"
        log ""
        exit 1
    fi
}

main "$@"
