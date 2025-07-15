#!/bin/bash

# Test the complete tool permission flow
# Usage: ./test-tool-permission-flow.sh

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_URL="${SERVER_URL:-http://localhost:3456}"

# Check if server is running
if ! curl -s "${SERVER_URL}/status" > /dev/null; then
    echo "Error: Server is not running at ${SERVER_URL}"
    exit 1
fi

echo "=== Testing Tool Permission Flow ==="
echo

# Test 1: Request that needs tool permission
echo "Test 1: Sending request that needs tool permission..."
"$SCRIPT_DIR/send-message.sh" "Can you read the package.json file?"
echo
echo "Waiting for permission request..."
sleep 10

# Check if interaction is waiting for permission
echo "Checking interaction status..."
INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
WAITING=$(echo "$INTERACTIONS" | jq -r '.[] | select(.metadata.status == "waiting_for_permission") | .id')

if [ -n "$WAITING" ]; then
    echo "✓ Found interaction waiting for permission: $WAITING"
    echo
    
    # Test 2: Approve permission
    echo "Test 2: Approving permission..."
    "$SCRIPT_DIR/approve-permission.sh"
    echo
    echo "Waiting for tool execution..."
    sleep 10
    
    # Check if tool was executed
    UPDATED=$(curl -s "${SERVER_URL}/interactions")
    STATUS=$(echo "$UPDATED" | jq -r --arg id "$WAITING" '.[] | select(.id == $id) | .metadata.status')
    
    if [ "$STATUS" == "completed" ]; then
        echo "✓ Tool executed successfully"
    else
        echo "✗ Tool execution failed (status: $STATUS)"
    fi
else
    echo "✗ No interaction waiting for permission found"
fi

echo
echo "=== Test Complete ==="