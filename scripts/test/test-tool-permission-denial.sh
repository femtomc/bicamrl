#!/bin/bash

# Test tool permission denial flow
# Usage: ./test-tool-permission-denial.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_URL="${SERVER_URL:-http://localhost:3456}"

echo "=== Testing Tool Permission Denial Flow ==="
echo

# Test 1: Request that needs tool permission
echo "Test 1: Sending request that needs tool permission..."
"$SCRIPT_DIR/send-message.sh" "Can you write 'Hello World' to test.txt?"
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
    
    # Test 2: Deny permission
    echo "Test 2: Denying permission..."
    "$SCRIPT_DIR/deny-permission.sh"
    echo
    echo "Waiting for response..."
    sleep 5
    
    # Check final status
    UPDATED=$(curl -s "${SERVER_URL}/interactions")
    STATUS=$(echo "$UPDATED" | jq -r --arg id "$WAITING" '.[] | select(.id == $id) | .metadata.status')
    MESSAGES=$(echo "$UPDATED" | jq -r --arg id "$WAITING" '.[] | select(.id == $id) | .content | length')
    
    if [ "$STATUS" == "completed" ]; then
        echo "✓ Interaction completed successfully"
        echo "✓ Total messages: $MESSAGES"
        
        # Check that file was NOT created
        if [ ! -f "test.txt" ]; then
            echo "✓ File was not created (as expected)"
        else
            echo "✗ File was created (unexpected)"
            rm -f test.txt
        fi
    else
        echo "✗ Interaction not completed (status: $STATUS)"
    fi
else
    echo "✗ No interaction waiting for permission found"
fi

echo
echo "=== Test Complete ==="