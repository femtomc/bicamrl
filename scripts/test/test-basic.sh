#!/bin/bash

# Basic smoke test to verify system is working
# Usage: ./test-basic.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_URL="${SERVER_URL:-http://localhost:3456}"

echo "=== Basic Smoke Test ==="
echo

# Test 1: Server health check
echo "Test 1: Server health check..."
if curl -s "${SERVER_URL}/status" > /dev/null; then
    echo "✓ Server is responding"
else
    echo "✗ Server is not responding"
    exit 1
fi

echo

# Test 2: Send simple message
echo "Test 2: Send simple message..."
RESPONSE=$("$SCRIPT_DIR/send-message.sh" "Hello, Bicamrl!")
ID=$(echo "$RESPONSE" | jq -r '.id')

if [ -n "$ID" ] && [ "$ID" != "null" ]; then
    echo "✓ Message accepted (ID: $ID)"
else
    echo "✗ Failed to send message"
    echo "Response: $RESPONSE"
    exit 1
fi

echo

# Test 3: Check interactions endpoint
echo "Test 3: Check interactions endpoint..."
INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
COUNT=$(echo "$INTERACTIONS" | jq '. | length')

if [ "$COUNT" -gt 0 ]; then
    echo "✓ Interactions endpoint working ($COUNT interactions)"
else
    echo "✗ No interactions found"
    exit 1
fi

echo

# Test 4: Wait for processing
echo "Test 4: Waiting for message processing..."
sleep 5

# Check if our message was processed
INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
OUR_INTERACTION=$(echo "$INTERACTIONS" | jq --arg id "$ID" '.[] | select(.id == $id)')
STATUS=$(echo "$OUR_INTERACTION" | jq -r '.metadata.status // .status')
MESSAGES=$(echo "$OUR_INTERACTION" | jq '.content | length')

echo "Interaction status: $STATUS"
echo "Message count: $MESSAGES"

if [ "$MESSAGES" -gt 1 ]; then
    echo "✓ Message was processed (has response)"
else
    echo "✗ Message not processed yet"
    exit 1
fi

echo
echo "=== Basic Smoke Test Complete ==="
exit 0