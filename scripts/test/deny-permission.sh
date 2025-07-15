#!/bin/bash

# Deny tool permission request
# Usage: ./deny-permission.sh

SERVER_URL="${SERVER_URL:-http://localhost:3456}"

# Send denial message
RESPONSE=$(curl -s -X POST "${SERVER_URL}/message" \
    -H "Content-Type: application/json" \
    -d '{"content": "No, do not use that tool"}')

echo "Sent denial"
echo "$RESPONSE" | jq .