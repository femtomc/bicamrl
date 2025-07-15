#!/bin/bash

# Test API edge cases and error conditions
# Usage: ./test-api-edge-cases.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_URL="${SERVER_URL:-http://localhost:3456}"

echo "=== Testing API Edge Cases ==="
echo

# Test 1: Message with special characters
echo "Test 1: Message with special characters..."
SPECIAL_MSG='Test with "quotes" and \backslash\ and newline
and special chars: $@#%^&*()'

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SERVER_URL}/message" \
    -H "Content-Type: application/json" \
    -d @- <<EOF
{"content": $(echo "$SPECIAL_MSG" | jq -Rs .)}
EOF
)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" == "200" ]; then
    echo "✓ Special characters handled correctly"
else
    echo "✗ Failed to handle special characters (HTTP $HTTP_CODE)"
    exit 1
fi

echo

# Test 2: Very long message
echo "Test 2: Very long message..."
LONG_MSG=$(python3 -c "print('A' * 10000)")
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SERVER_URL}/message" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"$LONG_MSG\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" == "200" ]; then
    echo "✓ Long message accepted"
else
    echo "✗ Long message rejected (HTTP $HTTP_CODE)"
fi

echo

# Test 3: Invalid JSON
echo "Test 3: Invalid JSON..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SERVER_URL}/message" \
    -H "Content-Type: application/json" \
    -d '{content: "missing quotes"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" != "200" ]; then
    echo "✓ Invalid JSON rejected"
else
    echo "✗ Invalid JSON accepted unexpectedly"
    exit 1
fi

echo

# Test 4: Missing content field
echo "Test 4: Missing content field..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SERVER_URL}/message" \
    -H "Content-Type: application/json" \
    -d '{"wrongfield": "test"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" == "400" ] && [[ "$BODY" == *"No content provided"* ]]; then
    echo "✓ Missing content field handled correctly"
else
    echo "✗ Missing content field not handled properly"
    echo "Response: $BODY"
fi

echo

# Test 5: GET request to interactions endpoint
echo "Test 5: GET interactions endpoint..."
RESPONSE=$(curl -s -w "\n%{http_code}" "${SERVER_URL}/interactions")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" == "200" ]; then
    # Should return array
    if echo "$BODY" | jq -e '. | type == "array"' > /dev/null; then
        echo "✓ Interactions endpoint returns array"
    else
        echo "✗ Interactions endpoint returns non-array"
        exit 1
    fi
else
    echo "✗ Interactions endpoint failed (HTTP $HTTP_CODE)"
    exit 1
fi

echo

# Test 6: Concurrent identical messages
echo "Test 6: Concurrent identical messages..."
for i in {1..3}; do
    curl -s -X POST "${SERVER_URL}/message" \
        -H "Content-Type: application/json" \
        -d '{"content": "Concurrent test message"}' > /tmp/concurrent-$i.json &
done
wait

# All should succeed
SUCCESS_COUNT=0
for i in {1..3}; do
    if [ -f "/tmp/concurrent-$i.json" ] && jq -e '.id' /tmp/concurrent-$i.json > /dev/null 2>&1; then
        ((SUCCESS_COUNT++))
    fi
    rm -f /tmp/concurrent-$i.json
done

if [ "$SUCCESS_COUNT" -eq 3 ]; then
    echo "✓ All concurrent requests succeeded"
else
    echo "✗ Only $SUCCESS_COUNT/3 concurrent requests succeeded"
    exit 1
fi

echo
echo "=== API Edge Cases Test Complete ==="
exit 0