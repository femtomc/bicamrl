#!/bin/bash

# Performance test - measure response times and throughput
# Usage: ./test-performance.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_URL="${SERVER_URL:-http://localhost:3456}"

echo "=== Performance Testing ==="
echo

# Test 1: Single request response time
echo "Test 1: Measuring single request response time..."
START_TIME=$(date +%s%N)
RESPONSE=$("$SCRIPT_DIR/send-message.sh" "What is 2+2?")
END_TIME=$(date +%s%N)
DURATION=$((($END_TIME - $START_TIME) / 1000000))  # Convert to milliseconds

echo "Single request completed in ${DURATION}ms"
if [ "$DURATION" -lt 5000 ]; then
    echo "✓ Response time acceptable (<5s)"
else
    echo "✗ Response time too slow (>5s)"
fi

echo

# Test 2: Burst of requests
echo "Test 2: Burst test - 10 concurrent requests..."
rm -f /tmp/perf-*.json
START_TIME=$(date +%s%N)

for i in {1..10}; do
    (
        curl -s -X POST "${SERVER_URL}/message" \
            -H "Content-Type: application/json" \
            -d "{\"content\": \"Burst test request $i\"}" > /tmp/perf-$i.json
    ) &
done
wait

END_TIME=$(date +%s%N)
DURATION=$((($END_TIME - $START_TIME) / 1000000))
AVG_TIME=$(($DURATION / 10))

# Count successful responses
SUCCESS_COUNT=0
for i in {1..10}; do
    if [ -f "/tmp/perf-$i.json" ] && jq -e '.id' /tmp/perf-$i.json > /dev/null 2>&1; then
        ((SUCCESS_COUNT++))
    fi
done

echo "Burst completed in ${DURATION}ms (avg ${AVG_TIME}ms per request)"
echo "Success rate: $SUCCESS_COUNT/10"

if [ "$SUCCESS_COUNT" -eq 10 ] && [ "$AVG_TIME" -lt 1000 ]; then
    echo "✓ Burst test passed (all succeeded, <1s avg)"
else
    echo "✗ Burst test issues detected"
fi

# Cleanup
rm -f /tmp/perf-*.json

echo

# Test 3: Tool permission response time
echo "Test 3: Tool permission flow performance..."
START_TIME=$(date +%s%N)

# Send request needing tool
RESPONSE=$("$SCRIPT_DIR/send-message.sh" "List files in current directory")
sleep 10  # Wait for permission request

# Approve
"$SCRIPT_DIR/approve-permission.sh" > /dev/null
sleep 10  # Wait for execution

END_TIME=$(date +%s%N)
TOTAL_TIME=$((($END_TIME - $START_TIME) / 1000000))

echo "Tool permission flow completed in ${TOTAL_TIME}ms"
if [ "$TOTAL_TIME" -lt 25000 ]; then
    echo "✓ Tool flow time acceptable (<25s)"
else
    echo "✗ Tool flow too slow (>25s)"
fi

echo

# Test 4: Memory check
echo "Test 4: Checking server memory usage..."
SERVER_PID=$(lsof -ti:3456 | head -1)
if [ -n "$SERVER_PID" ]; then
    MEM_KB=$(ps -o rss= -p "$SERVER_PID" | tr -d ' ')
    MEM_MB=$((MEM_KB / 1024))
    echo "Server memory usage: ${MEM_MB}MB"
    
    if [ "$MEM_MB" -lt 500 ]; then
        echo "✓ Memory usage acceptable (<500MB)"
    else
        echo "✗ High memory usage (>500MB)"
    fi
else
    echo "⚠ Could not find server process"
fi

echo
echo "=== Performance Test Complete ==="
exit 0