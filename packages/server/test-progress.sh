#!/bin/bash

# Test script to verify real-time progress updates

echo "=== Testing Real-Time Progress Updates ==="
echo

# Send a test message
echo "Sending test message..."
response=$(curl -s -X POST http://localhost:3456/message \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello! Can you explain what Bicamrl is in a few sentences?",
    "worktreeId": null
  }')

interaction_id=$(echo "$response" | jq -r '.interactionId')
echo "Created interaction: $interaction_id"
echo

# Monitor the interaction for progress updates
echo "Monitoring progress updates..."
echo "Press Ctrl+C to stop"
echo

# Function to get and display interaction
show_interaction() {
  local response=$(curl -s "http://localhost:3456/interactions/$interaction_id")
  local status=$(echo "$response" | jq -r '.status')
  local current_action=$(echo "$response" | jq -r '.metadata.currentAction // empty')
  local tokens=$(echo "$response" | jq -r '.metadata.tokens.output // 0')
  
  printf "\r%-20s | %-50s | Tokens: %-6s" "$status" "$current_action" "$tokens"
}

# Clear line and show header
echo "Status               | Progress                                           | Tokens"
echo "-------------------- | -------------------------------------------------- | -------"

# Monitor until completed
while true; do
  show_interaction
  
  # Check if completed
  status=$(curl -s "http://localhost:3456/interactions/$interaction_id" | jq -r '.status')
  if [[ "$status" == "completed" ]]; then
    echo
    echo
    echo "=== Interaction Completed ==="
    
    # Show final response
    response=$(curl -s "http://localhost:3456/interactions/$interaction_id" | jq -r '.content[-1].content')
    echo
    echo "Response:"
    echo "$response"
    break
  fi
  
  sleep 0.1
done