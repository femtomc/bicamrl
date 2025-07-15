#!/bin/bash

# Approve tool permission request
# Usage: ./approve-permission.sh

SERVER_URL="${SERVER_URL:-http://localhost:3456}"

# Send approval message
RESPONSE=$(curl -s -X POST "${SERVER_URL}/message" \
    -H "Content-Type: application/json" \
    -d '{"content": "Yes, go ahead"}')

echo "Sent approval"
echo "$RESPONSE" | jq .