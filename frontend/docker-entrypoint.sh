#!/bin/sh
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AI Product Factory - Dashboard Startup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Run startup recovery (resets stuck imports from interrupted container restarts)
run_startup_recovery() {
    if [ -f "scripts/startup-recovery.mjs" ]; then
        node scripts/startup-recovery.mjs || true
    fi
}

# Check if migrations should be skipped (handled by init container)
if [ "$SKIP_MIGRATIONS" = "true" ]; then
    echo "✅ Migrations handled by init container (SKIP_MIGRATIONS=true)"
    run_startup_recovery
    echo ""
    echo "🚀 Starting application..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exec node .output/server/index.mjs
fi

# Legacy mode: Run migrations in entrypoint (for backwards compatibility)
echo "⏳ Running database migrations..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    # Use the migration script to test connectivity (it handles connection testing)
    if node scripts/db-migrate.mjs 2>/dev/null; then
        run_startup_recovery
        echo ""
        echo "🚀 Starting application..."
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        exec node .output/server/index.mjs
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo "❌ Database not ready after ${MAX_RETRIES} attempts"
        exit 1
    fi

    echo "   Retry $RETRY_COUNT/$MAX_RETRIES - waiting 2s..."
    sleep 2
done
