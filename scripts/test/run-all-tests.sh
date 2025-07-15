#!/bin/bash

# Run all tests - both unit tests and integration tests
# Usage: ./run-all-tests.sh

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "==================================="
echo "Running Bicamrl Complete Test Suite"
echo "==================================="
echo

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test and track result
run_test() {
    local test_name=$1
    local test_command=$2
    
    echo -e "${YELLOW}Running: $test_name${NC}"
    if eval "$test_command"; then
        echo -e "${GREEN}✓ $test_name passed${NC}\n"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ $test_name failed${NC}\n"
        ((TESTS_FAILED++))
    fi
}

# Kill any existing servers
echo "Cleaning up existing processes..."
"$PROJECT_ROOT/scripts/test/cleanup.sh" 2>/dev/null || true
echo

# Start server in background
echo "Starting test server..."
cd "$PROJECT_ROOT/packages/server"
bun run --hot src/index.ts > "$PROJECT_ROOT/test-server.log" 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server to start
echo "Waiting for server to start..."
for i in {1..30}; do
    if curl -s http://localhost:3456/status > /dev/null; then
        echo "Server is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "Server failed to start!"
        cat "$PROJECT_ROOT/test-server.log"
        exit 1
    fi
    sleep 1
done
echo

# Run unit tests
echo "=== Running Unit Tests ==="
run_test "All unit tests" "cd '$PROJECT_ROOT/packages/server' && bun test"

# Run bash integration tests
echo "=== Running Integration Tests ==="
run_test "API edge cases" "$SCRIPT_DIR/test-api-edge-cases.sh"
run_test "Tool permission approval flow" "$SCRIPT_DIR/test-tool-permission-flow.sh"
run_test "Tool permission denial flow" "$SCRIPT_DIR/test-tool-permission-denial.sh"
run_test "Multiple tool requests" "$SCRIPT_DIR/test-multiple-tools.sh"
run_test "Concurrent interactions" "$SCRIPT_DIR/test-concurrent-interactions.sh"
run_test "Error handling" "$SCRIPT_DIR/test-error-handling.sh"

# Cleanup
echo
echo "Cleaning up..."
kill $SERVER_PID 2>/dev/null || true
rm -f "$PROJECT_ROOT/test-server.log"

# Summary
echo
echo "==================================="
echo "Test Summary"
echo "==================================="
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}Some tests failed!${NC}"
    exit 1
fi