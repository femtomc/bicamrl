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
        "Type: \(.interaction_type)",
        "Source: \(.source)", 
        "Status: \(.status)",
        "Worktree: \(.metadata.worktreeContext.worktreePath // "none")",
        "Messages: \(.content | length)",
        if .permission_request then "Permission Request: \(.permission_request.toolName)" else empty end,
        "---"'
    
    sleep 2
done