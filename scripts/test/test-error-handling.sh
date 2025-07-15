#!/bin/bash

# Test error handling scenarios
# Usage: ./test-error-handling.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_URL="${SERVER_URL:-http://localhost:3456}"

echo "=== Testing Error Handling ==="
echo

# Test 1: Invalid tool arguments
echo "Test 1: Request with invalid file path..."
RESPONSE1=$("$SCRIPT_DIR/send-message.sh" "Read the file at /definitely/not/a/real/path/file.txt")
ID1=$(echo "$RESPONSE1" | jq -r '.id')
echo "Created interaction: $ID1"

echo "Waiting for permission request..."
sleep 10

INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
STATUS1=$(echo "$INTERACTIONS" | jq -r --arg id "$ID1" '.[] | select(.id == $id) | .metadata.status')

if [ "$STATUS1" == "waiting_for_permission" ]; then
    echo "✓ Requesting permission for invalid file"
    
    # Approve to see error handling
    echo "Approving request..."
    "$SCRIPT_DIR/approve-permission.sh" > /dev/null
    sleep 10
    
    # Check if error was handled gracefully
    INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
    LAST_MSG=$(echo "$INTERACTIONS" | jq -r --arg id "$ID1" '.[] | select(.id == $id) | .content[-1].content')
    
    if [[ "$LAST_MSG" == *"error"* ]] || [[ "$LAST_MSG" == *"Error"* ]] || [[ "$LAST_MSG" == *"not found"* ]]; then
        echo "✓ Error handled gracefully"
    else
        echo "✗ Error not properly communicated"
        echo "Last message: $LAST_MSG"
    fi
else
    echo "✗ Did not request permission (status: $STATUS1)"
fi

echo

# Test 2: Malformed approval message
echo "Test 2: Sending malformed approval..."
RESPONSE2=$("$SCRIPT_DIR/send-message.sh" "Try to read package.json")
ID2=$(echo "$RESPONSE2" | jq -r '.id')

echo "Waiting for permission request..."
sleep 10

# Send ambiguous response
echo "Sending ambiguous response..."
curl -s -X POST "${SERVER_URL}/message" \
    -H "Content-Type: application/json" \
    -d '{"content": "maybe... I am not sure"}' > /dev/null

sleep 5

# Check how it was interpreted
INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
STATUS2=$(echo "$INTERACTIONS" | jq -r --arg id "$ID2" '.[] | select(.id == $id) | .metadata.status')
LAST_MSG=$(echo "$INTERACTIONS" | jq -r --arg id "$ID2" '.[] | select(.id == $id) | .content[-1].content')

echo "Status after ambiguous response: $STATUS2"
if [[ "$LAST_MSG" == *"won't use"* ]] || [[ "$LAST_MSG" == *"understand"* ]]; then
    echo "✓ Ambiguous response treated as denial"
else
    echo "✗ Ambiguous response not handled properly"
fi

echo

# Test 3: Empty message
echo "Test 3: Sending empty message..."
RESPONSE3=$(curl -s -X POST "${SERVER_URL}/message" \
    -H "Content-Type: application/json" \
    -d '{"content": ""}')

if [[ "$RESPONSE3" == *"error"* ]]; then
    echo "✓ Empty message rejected"
else
    echo "✗ Empty message not properly rejected"
    echo "Response: $RESPONSE3"
fi

echo

# Test 4: Rapid-fire requests
echo "Test 4: Rapid-fire requests..."
for i in {1..5}; do
    "$SCRIPT_DIR/send-message.sh" "Request $i: Read test$i.txt" > /dev/null &
done
wait

sleep 10

# Check all interactions are properly queued
INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
INTERACTION_COUNT=$(echo "$INTERACTIONS" | jq '. | length')

echo "Created $INTERACTION_COUNT interactions from rapid requests"
if [ "$INTERACTION_COUNT" -ge 5 ]; then
    echo "✓ All rapid requests handled"
else
    echo "✗ Some rapid requests lost"
fi

echo
echo "=== Error Handling Test Complete ==="
exit 0