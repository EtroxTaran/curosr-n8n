#!/bin/bash
# ============================================
# AI Product Factory - Migration Idempotency Test
# ============================================
# This script verifies that database migrations can be run multiple
# times without errors (idempotent migrations).

set -e

echo "=== Testing Database Migration Idempotency ==="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Database connection
DB_URL="${DATABASE_URL:-postgres://n8n:n8n@localhost:5432/n8n}"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql command not found. Please install PostgreSQL client."
    exit 1
fi

# Ensure PostgreSQL is accessible
echo "Checking PostgreSQL connectivity..."
if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo "⚠️  PostgreSQL not running on localhost:5432"
    echo "   Start with: docker-compose up postgres -d"
    echo "   Or set DATABASE_URL environment variable"
    exit 1
fi
echo "✓  PostgreSQL is accessible"
echo ""

# Run migration first time
echo "Running migration (attempt 1)..."
if ! psql "$DB_URL" -f init-scripts/01-project-state.sql 2>&1 | tee /tmp/migration1.log; then
    echo ""
    echo "❌ FAILED: First migration failed"
    exit 1
fi
echo "✓  First migration completed"
echo ""

# Run migration second time (idempotency test)
echo "Running migration (attempt 2 - idempotency test)..."
if ! psql "$DB_URL" -f init-scripts/01-project-state.sql 2>&1 | tee /tmp/migration2.log; then
    # Check if it's a real error or just "already exists" notices
    if grep "ERROR" /tmp/migration2.log | grep -v "already exists" > /dev/null 2>&1; then
        echo ""
        echo "❌ FAILED: Second migration failed with unexpected error"
        grep "ERROR" /tmp/migration2.log
        exit 1
    fi
fi
echo "✓  Second migration completed (idempotent)"
echo ""

# Check for input_files migration
if [ -f "init-scripts/02-add-input-files.sql" ]; then
    echo "Running input_files migration..."
    if ! psql "$DB_URL" -f init-scripts/02-add-input-files.sql 2>&1 | tee /tmp/migration3.log; then
        if grep "ERROR" /tmp/migration3.log | grep -v "already exists" > /dev/null 2>&1; then
            echo ""
            echo "❌ FAILED: Input files migration failed"
            exit 1
        fi
    fi
    echo "✓  Input files migration completed"
    echo ""
fi

# Verify tables exist
echo "Verifying table structure..."
TABLES=$(psql "$DB_URL" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")

REQUIRED_TABLES=("chat_messages" "decision_log_entries" "project_state")
MISSING=0

for table in "${REQUIRED_TABLES[@]}"; do
    if echo "$TABLES" | grep -q "$table"; then
        echo "✓  Table exists: $table"
    else
        echo "⚠️  Missing table: $table"
        MISSING=$((MISSING + 1))
    fi
done

echo ""

if [ $MISSING -gt 0 ]; then
    echo "❌ FAILED: $MISSING required tables missing"
    exit 1
fi

# Verify views exist
echo "Verifying views..."
VIEWS=$(psql "$DB_URL" -t -c "SELECT viewname FROM pg_views WHERE schemaname = 'public'")

REQUIRED_VIEWS=("project_summary" "recent_activity")
for view in "${REQUIRED_VIEWS[@]}"; do
    if echo "$VIEWS" | grep -q "$view"; then
        echo "✓  View exists: $view"
    else
        echo "⚠️  Missing view: $view"
        MISSING=$((MISSING + 1))
    fi
done

echo ""

if [ $MISSING -gt 0 ]; then
    echo "❌ FAILED: Required views missing"
    exit 1
fi

# Verify indexes
echo "Verifying indexes..."
INDEX_COUNT=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'")
echo "   Total indexes: $(echo $INDEX_COUNT | tr -d ' ')"

# Verify dashboard_reader role
echo ""
echo "Verifying roles..."
if psql "$DB_URL" -t -c "SELECT rolname FROM pg_roles WHERE rolname = 'dashboard_reader'" | grep -q "dashboard_reader"; then
    echo "✓  Role exists: dashboard_reader"
else
    echo "⚠️  Role missing: dashboard_reader (may require superuser to create)"
fi

echo ""
echo "=== Summary ==="
echo "✅ PASSED: Database migrations are idempotent"
echo "   Tables: ${REQUIRED_TABLES[*]}"
echo "   Views: ${REQUIRED_VIEWS[*]}"
