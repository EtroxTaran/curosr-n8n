#!/bin/bash
# ============================================
# AI Product Factory - Workflow Sync Dry Run Test
# ============================================
# This script verifies the workflow sync script can read and parse
# all JSON workflow files without errors.

set -e

echo "=== Testing Workflow Sync Script (Dry Run) ==="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Check if sync script exists
if [ ! -f "scripts/sync-workflows.js" ]; then
    echo "❌ FAILED: sync-workflows.js not found"
    exit 1
fi

# Run dry-run and capture output
echo "Running: node scripts/sync-workflows.js --dry-run --verbose"
echo ""

node scripts/sync-workflows.js --dry-run --verbose 2>&1 | tee /tmp/sync-output.log

EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "=== Analysis ==="

# Check for JSON parsing errors
if grep -q "SyntaxError\|Unexpected token\|JSON\.parse" /tmp/sync-output.log; then
    echo "❌ FAILED: JSON syntax errors detected"
    grep -A2 "SyntaxError\|Unexpected token" /tmp/sync-output.log
    exit 1
fi

# Check for file read errors
if grep -q "ENOENT\|Cannot find module\|no such file" /tmp/sync-output.log; then
    echo "❌ FAILED: Missing workflow files"
    grep "ENOENT\|Cannot find module" /tmp/sync-output.log
    exit 1
fi

# Verify all expected workflows detected
EXPECTED_WORKFLOWS=(
    "ai-product-factory-main-workflow"
    "ai-product-factory-api-workflow"
    "ai-product-factory-scavenging-subworkflow"
    "ai-product-factory-vision-loop-subworkflow"
    "ai-product-factory-architecture-loop-subworkflow"
    "ai-product-factory-s3-subworkflow"
    "ai-product-factory-decision-logger-subworkflow"
    "ai-product-factory-perplexity-research-subworkflow"
    "titan-graphiti-subworkflow"
    "titan-qdrant-subworkflow"
    "titan-adversarial-loop-subworkflow"
    "titan-paper-trail-packager-subworkflow"
)

echo ""
echo "Checking for expected workflows..."

MISSING=0
for workflow in "${EXPECTED_WORKFLOWS[@]}"; do
    if ! grep -q "$workflow" /tmp/sync-output.log; then
        echo "⚠️  WARNING: Workflow not detected: $workflow"
        MISSING=$((MISSING + 1))
    else
        echo "✓  Found: $workflow"
    fi
done

echo ""

if [ $MISSING -gt 0 ]; then
    echo "❌ FAILED: $MISSING expected workflows not detected"
    exit 1
fi

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ PASSED: Sync script dry-run completed successfully"
    echo "   All ${#EXPECTED_WORKFLOWS[@]} workflows detected and valid"
    exit 0
else
    echo "❌ FAILED: Sync script exited with code $EXIT_CODE"
    exit 1
fi
