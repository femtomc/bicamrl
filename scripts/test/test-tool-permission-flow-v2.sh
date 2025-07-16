#!/bin/bash

# Test the complete tool permission flow (V2 - updated for new API)
# Usage: ./test-tool-permission-flow-v2.sh

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_URL="${SERVER_URL:-http://localhost:3456}"

# Check if server is running
if ! curl -s "${SERVER_URL}/health" > /dev/null; then
    echo "Error: Server is not running at ${SERVER_URL}"
    exit 1
fi

echo "=== Testing Tool Permission Flow ==="
echo

# Test 1: Request that needs tool permission
echo "Test 1: Sending request that needs tool permission..."
RESPONSE=$("$SCRIPT_DIR/send-message.sh" "Can you read the package.json file?")
INTERACTION_ID=$(echo "$RESPONSE" | jq -r '.id')
echo "Created interaction: $INTERACTION_ID"
echo

echo "Waiting for permission request..."
sleep 5

# Check if interaction is waiting for permission
echo "Checking interaction status..."
INTERACTION=$(curl -s "${SERVER_URL}/interactions/${INTERACTION_ID}")
STATE=$(echo "$INTERACTION" | jq -r '.state.kind')

if [ "$STATE" == "waiting_permission" ]; then
    echo "✓ Found interaction waiting for permission"
    TOOL=$(echo "$INTERACTION" | jq -r '.state.tool')
    echo "  Tool: $TOOL"
    echo
    
    # Test 2: Approve permission
    echo "Test 2: Approving permission..."
    "$SCRIPT_DIR/approve-permission.sh"
    echo
    echo "Waiting for tool execution..."
    sleep 10
    
    # Check if tool was executed
    UPDATED=$(curl -s "${SERVER_URL}/interactions/${INTERACTION_ID}")
    UPDATED_STATE=$(echo "$UPDATED" | jq -r '.state.kind')
    
    if [ "$UPDATED_STATE" == "completed" ]; then
        echo "✓ Tool executed successfully"
        echo "Response:"
        echo "$UPDATED" | jq -r '.content[-1].content' | head -50
    else
        echo "✗ Tool execution failed (state: $UPDATED_STATE)"
        if [ "$UPDATED_STATE" == "failed" ]; then
            ERROR=$(echo "$UPDATED" | jq -r '.state.error')
            echo "Error: $ERROR"
        fi
    fi
else
    echo "✗ No permission request found (state: $STATE)"
    if [ "$STATE" == "failed" ]; then
        ERROR=$(echo "$INTERACTION" | jq -r '.state.error')
        echo "Error: $ERROR"
    fi
fi

echo
echo "=== Test Complete ==="