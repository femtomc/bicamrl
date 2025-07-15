#!/bin/bash

# Test concurrent interactions with tool permissions
# Usage: ./test-concurrent-interactions.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_URL="${SERVER_URL:-http://localhost:3456}"

echo "=== Testing Concurrent Interactions ==="
echo

# Start two interactions concurrently
echo "Starting two concurrent interactions..."

# First interaction
RESPONSE1=$("$SCRIPT_DIR/send-message.sh" "Read the README.md file")
ID1=$(echo "$RESPONSE1" | jq -r '.id')
echo "Interaction 1: $ID1"

# Second interaction immediately after
RESPONSE2=$("$SCRIPT_DIR/send-message.sh" "List files in the current directory")
ID2=$(echo "$RESPONSE2" | jq -r '.id')
echo "Interaction 2: $ID2"

echo
echo "Waiting for both to request permissions..."
sleep 10

# Check both interactions
INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
STATUS1=$(echo "$INTERACTIONS" | jq -r --arg id "$ID1" '.[] | select(.id == $id) | .metadata.status')
STATUS2=$(echo "$INTERACTIONS" | jq -r --arg id "$ID2" '.[] | select(.id == $id) | .metadata.status')
LOCKED1=$(echo "$INTERACTIONS" | jq -r --arg id "$ID1" '.[] | select(.id == $id) | .lockedFor')
LOCKED2=$(echo "$INTERACTIONS" | jq -r --arg id "$ID2" '.[] | select(.id == $id) | .lockedFor')

echo "Interaction 1 - Status: $STATUS1, Locked for: $LOCKED1"
echo "Interaction 2 - Status: $STATUS2, Locked for: $LOCKED2"

# Both should be waiting for permission
if [ "$STATUS1" == "waiting_for_permission" ] && [ "$STATUS2" == "waiting_for_permission" ]; then
    echo "✓ Both interactions waiting for permission"
else
    echo "✗ Not both waiting for permission"
    exit 1
fi

# Both should be locked for user
if [ "$LOCKED1" == "user" ] && [ "$LOCKED2" == "user" ]; then
    echo "✓ Both interactions locked for user"
else
    echo "✗ Not both locked for user"
    exit 1
fi

echo

# Approve first interaction
echo "Approving first interaction..."
# The approve script will add to the first waiting interaction it finds
"$SCRIPT_DIR/approve-permission.sh" > /dev/null
sleep 10

# Check status after first approval
INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
STATUS1=$(echo "$INTERACTIONS" | jq -r --arg id "$ID1" '.[] | select(.id == $id) | .metadata.status')
STATUS2=$(echo "$INTERACTIONS" | jq -r --arg id "$ID2" '.[] | select(.id == $id) | .metadata.status')

echo "After first approval:"
echo "Interaction 1 - Status: $STATUS1"
echo "Interaction 2 - Status: $STATUS2"

# One should be completed, other still waiting
if { [ "$STATUS1" == "completed" ] && [ "$STATUS2" == "waiting_for_permission" ]; } || 
   { [ "$STATUS1" == "waiting_for_permission" ] && [ "$STATUS2" == "completed" ]; }; then
    echo "✓ One completed, one still waiting"
else
    echo "✗ Unexpected status combination"
    exit 1
fi

echo

# Deny second interaction
echo "Denying remaining interaction..."
"$SCRIPT_DIR/deny-permission.sh" > /dev/null
sleep 5

# Final check - both should be completed
INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
STATUS1=$(echo "$INTERACTIONS" | jq -r --arg id "$ID1" '.[] | select(.id == $id) | .metadata.status')
STATUS2=$(echo "$INTERACTIONS" | jq -r --arg id "$ID2" '.[] | select(.id == $id) | .metadata.status')

echo "Final status:"
echo "Interaction 1 - Status: $STATUS1"
echo "Interaction 2 - Status: $STATUS2"

if [ "$STATUS1" == "completed" ] && [ "$STATUS2" == "completed" ]; then
    echo "✓ Both interactions completed"
else
    echo "✗ Not both completed"
    exit 1
fi

echo
echo "=== Concurrent Interactions Test Complete ==="
exit 0