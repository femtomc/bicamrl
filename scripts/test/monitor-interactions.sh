#!/bin/bash

# Monitor interactions in real-time
# Usage: ./monitor-interactions.sh

SERVER_URL="${SERVER_URL:-http://localhost:3456}"

echo "Monitoring interactions..."
echo "Press Ctrl+C to stop"
echo "---"

while true; do
    clear
    echo "=== Current Interactions ==="
    echo
    
    # Get all interactions
    INTERACTIONS=$(curl -s "${SERVER_URL}/interactions")
    
    # Parse and display each interaction
    echo "$INTERACTIONS" | jq -r '.[] | 
        "ID: \(.id)",
        "Type: \(.type)",
        "Source: \(.source)", 
        "Status: \(.metadata.status // "active")",
        "Locked for: \(.lockedFor // "none")",
        "Messages: \(.content | length)",
        "---"'
    
    sleep 2
done