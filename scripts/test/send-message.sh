#!/bin/bash

# Send a message to the Bicamrl server
# Usage: ./send-message.sh "Your message here"

if [ -z "$1" ]; then
    echo "Usage: $0 \"Your message here\""
    exit 1
fi

SERVER_URL="${SERVER_URL:-http://localhost:3456}"
MESSAGE="$1"

# Escape the message for JSON
ESCAPED_MESSAGE=$(echo "$MESSAGE" | sed 's/"/\\"/g' | sed 's/\\/\\\\/g' | tr -d '\n')

# Send the message
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SERVER_URL}/message" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"${ESCAPED_MESSAGE}\"}")

# Extract HTTP status code
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Check for errors
if [ "$HTTP_CODE" != "200" ]; then
    echo "Error: Server returned HTTP $HTTP_CODE"
    echo "$BODY"
    exit 1
fi

# Pretty print the response
echo "$BODY" | jq . || echo "$BODY"