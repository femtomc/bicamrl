#!/bin/bash

# CI-friendly test runner with proper exit codes and structured output
# Usage: ./run-ci-tests.sh

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Output format for CI
if [ "$CI" = "true" ]; then
    echo "::group::Bicamrl Test Suite"
fi

echo "==================================="
echo "Bicamrl CI Test Suite"
echo "==================================="
echo "Environment:"
echo "  NODE_ENV: ${NODE_ENV:-development}"
echo "  CI: ${CI:-false}"
echo "  Server URL: ${SERVER_URL:-http://localhost:3456}"
echo

# Track results
TOTAL_TESTS=0
FAILED_TESTS=0
FAILED_TEST_NAMES=""

# Function to run test with structured output
run_test() {
    local test_name=$1
    local test_command=$2
    local test_type=${3:-"test"}
    
    ((TOTAL_TESTS++))
    
    if [ "$CI" = "true" ]; then
        echo "::group::$test_name"
    fi
    
    echo "[TEST] $test_name"
    local start_time=$(date +%s)
    
    if eval "$test_command" > /tmp/test-output.log 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo "[PASS] $test_name (${duration}s)"
        
        if [ "$VERBOSE" = "true" ]; then
            cat /tmp/test-output.log
        fi
    else
        local exit_code=$?
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo "[FAIL] $test_name (${duration}s, exit code: $exit_code)"
        ((FAILED_TESTS++))
        FAILED_TEST_NAMES="${FAILED_TEST_NAMES}  - $test_name\n"
        
        # Always show output for failed tests
        echo "--- Test Output ---"
        cat /tmp/test-output.log
        echo "--- End Output ---"
    fi
    
    if [ "$CI" = "true" ]; then
        echo "::endgroup::"
    fi
    
    rm -f /tmp/test-output.log
}

# Cleanup
echo "[SETUP] Cleaning up existing processes..."
"$PROJECT_ROOT/scripts/test/cleanup.sh" 2>/dev/null || true

# Start server
echo "[SETUP] Starting test server..."
cd "$PROJECT_ROOT/packages/server"
bun run --hot src/index.ts > "$PROJECT_ROOT/test-server.log" 2>&1 &
SERVER_PID=$!
echo "[SETUP] Server PID: $SERVER_PID"

# Wait for server with timeout
echo "[SETUP] Waiting for server to start..."
TIMEOUT=30
ELAPSED=0
while ! curl -s http://localhost:3456/status > /dev/null; do
    if [ $ELAPSED -ge $TIMEOUT ]; then
        echo "[ERROR] Server failed to start within ${TIMEOUT}s"
        echo "--- Server Log ---"
        cat "$PROJECT_ROOT/test-server.log"
        echo "--- End Log ---"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
    ((ELAPSED++))
done
echo "[SETUP] Server ready after ${ELAPSED}s"

# Run tests
echo
echo "[PHASE] Running Unit Tests"
run_test "Server unit tests" "cd '$PROJECT_ROOT/packages/server' && bun test --bail" "unit"

echo
echo "[PHASE] Running Integration Tests"
run_test "API edge cases" "$SCRIPT_DIR/test-api-edge-cases.sh" "integration"
run_test "Tool permission approval" "$SCRIPT_DIR/test-tool-permission-flow.sh" "integration"
run_test "Tool permission denial" "$SCRIPT_DIR/test-tool-permission-denial.sh" "integration"
run_test "Multiple tool requests" "$SCRIPT_DIR/test-multiple-tools.sh" "integration"
run_test "Concurrent interactions" "$SCRIPT_DIR/test-concurrent-interactions.sh" "integration"
run_test "Error handling" "$SCRIPT_DIR/test-error-handling.sh" "integration"

# Optional performance tests
if [ "$RUN_PERF_TESTS" = "true" ]; then
    echo
    echo "[PHASE] Running Performance Tests"
    run_test "Performance benchmarks" "$SCRIPT_DIR/test-performance.sh" "performance"
fi

# Cleanup
echo
echo "[CLEANUP] Stopping server..."
kill $SERVER_PID 2>/dev/null || true
rm -f "$PROJECT_ROOT/test-server.log"

# Generate summary
echo
echo "==================================="
echo "Test Summary"
echo "==================================="
echo "Total tests: $TOTAL_TESTS"
echo "Passed: $((TOTAL_TESTS - FAILED_TESTS))"
echo "Failed: $FAILED_TESTS"
echo

# List failed tests
if [ $FAILED_TESTS -gt 0 ]; then
    echo "Failed tests:"
    echo -e "$FAILED_TEST_NAMES"
fi

# Exit with proper code
if [ $FAILED_TESTS -eq 0 ]; then
    echo "[SUCCESS] All tests passed!"
    exit 0
else
    echo "[FAILURE] $FAILED_TESTS test(s) failed!"
    exit 1
fi