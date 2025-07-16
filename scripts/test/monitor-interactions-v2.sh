#!/bin/bash

# Monitor interactions in real-time (V2 - updated for new API format)
# Usage: ./monitor-interactions-v2.sh

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
        "State: \(.state.kind)",
        if .state.error then "Error: \(.state.error)" else empty end,
        "Worktree: \(.metadata.worktreeContext.worktreePath // "none")",
        "Messages: \(.content | length)",
        if .state.kind == "waiting_permission" then "Waiting for: \(.state.tool) permission" else empty end,
        "---"'
    
    echo
    echo "=== Process Health ==="
    HEALTH=$(curl -s "${SERVER_URL}/monitoring/health")
    echo "$HEALTH" | jq -r '"Total processes: \(.processes.total)", "Healthy: \(.processes.healthy)", "Unhealthy: \(.processes.unhealthy)"'
    
    sleep 2
done