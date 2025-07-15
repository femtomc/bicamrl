#!/bin/bash

# Test multiple tool requests in sequence
# Usage: ./test-multiple-tools.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_URL="${SERVER_URL:-http://localhost:3456}"

echo "=== Testing Multiple Tool Requests ==="
echo

# Test 1: First tool request
echo "Test 1: First tool request (read file)..."
RESPONSE1=$("$SCRIPT_DIR/send-message.sh" "Read the package.json file")
ID1=$(echo "$RESPONSE1" | jq -r '.id')
echo "Created interaction: $ID1"
echo

echo "Waiting for permission request..."
sleep 10

# Check if waiting for permission
INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
STATUS1=$(echo "$INTERACTIONS" | jq -r --arg id "$ID1" '.[] | select(.id == $id) | .metadata.status')

if [ "$STATUS1" == "waiting_for_permission" ]; then
    echo "✓ First request waiting for permission"
    
    # Approve first request
    echo "Approving first request..."
    "$SCRIPT_DIR/approve-permission.sh" > /dev/null
    sleep 10
    
    # Check if completed
    INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
    STATUS1=$(echo "$INTERACTIONS" | jq -r --arg id "$ID1" '.[] | select(.id == $id) | .metadata.status')
    
    if [ "$STATUS1" == "completed" ]; then
        echo "✓ First request completed"
    else
        echo "✗ First request failed (status: $STATUS1)"
        exit 1
    fi
else
    echo "✗ First request not waiting for permission (status: $STATUS1)"
    exit 1
fi

echo

# Test 2: Second tool request in same conversation
echo "Test 2: Second tool request (write file)..."
RESPONSE2=$("$SCRIPT_DIR/send-message.sh" "Now write 'Hello from test' to output.txt")
ID2=$(echo "$RESPONSE2" | jq -r '.id')

# If it's the same conversation, ID should match
if [ "$ID2" == "$ID1" ]; then
    echo "✓ Using same conversation"
else
    echo "✗ Created new conversation unexpectedly"
fi

echo "Waiting for second permission request..."
sleep 10

# Check if waiting for permission again
INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
STATUS2=$(echo "$INTERACTIONS" | jq -r --arg id "$ID1" '.[] | select(.id == $id) | .metadata.status')
MESSAGES=$(echo "$INTERACTIONS" | jq -r --arg id "$ID1" '.[] | select(.id == $id) | .content | length')

echo "Conversation has $MESSAGES messages"

if [ "$STATUS2" == "waiting_for_permission" ]; then
    echo "✓ Second request waiting for permission"
    
    # Deny second request
    echo "Denying second request..."
    "$SCRIPT_DIR/deny-permission.sh" > /dev/null
    sleep 5
    
    # Verify file was not created
    if [ ! -f "output.txt" ]; then
        echo "✓ File was not created (as expected)"
    else
        echo "✗ File was created unexpectedly"
        rm -f output.txt
        exit 1
    fi
else
    echo "✗ Second request not waiting for permission (status: $STATUS2)"
    exit 1
fi

echo
echo "=== Multiple Tool Requests Test Complete ==="
exit 0