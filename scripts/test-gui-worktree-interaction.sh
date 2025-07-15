#!/bin/bash

echo "GUI Worktree Interaction Test"
echo "============================="
echo ""
echo "This test verifies that Wake responds correctly when a worktree is selected."
echo ""

# Get worktrees
echo "Available worktrees:"
curl -s http://localhost:3456/worktrees | jq -r '.[] | "\(.id) - \(.branch)"'
echo ""

# Get main worktree ID
MAIN_WORKTREE_ID=$(curl -s http://localhost:3456/worktrees | jq -r '.[] | select(.branch == "refs/heads/main") | .id')
echo "Main worktree ID: $MAIN_WORKTREE_ID"
echo ""

# Send a message with worktree context
echo "Sending message with worktree context..."
RESPONSE=$(curl -s -X POST http://localhost:3456/message \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"What directory am I in?\", \"worktreeId\": \"$MAIN_WORKTREE_ID\"}")

MESSAGE_ID=$(echo $RESPONSE | jq -r '.id')
echo "Message ID: $MESSAGE_ID"
echo ""

echo "Waiting for Wake to respond..."
sleep 5

# Check the interaction
INTERACTION=$(curl -s http://localhost:3456/interactions/$MESSAGE_ID)
STATUS=$(echo $INTERACTION | jq -r '.status')
echo "Status: $STATUS"
echo ""

if [ "$STATUS" = "completed" ]; then
  echo "Response content:"
  echo $INTERACTION | jq -r '.content[] | select(.role == "assistant") | .content'
  echo ""
  
  echo "Metadata:"
  echo $INTERACTION | jq '.metadata'
else
  echo "Wake did not complete processing. Full interaction:"
  echo $INTERACTION | jq '.'
fi

echo ""
echo "GUI Test Instructions:"
echo "====================="
echo "1. Open the GUI (bun run dev:gui)"
echo "2. Select or create a worktree using the UI"
echo "3. Send a message like 'What directory am I in?'"
echo "4. Verify that:"
echo "   - The processing animation shows correctly"
echo "   - Wake responds with the worktree directory path"
echo "   - The response completes successfully"
echo ""
echo "Done!"