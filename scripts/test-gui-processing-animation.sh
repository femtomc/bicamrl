#!/bin/bash

echo "GUI Processing Animation Test"
echo "============================"
echo ""
echo "This test verifies that the GUI shows processing animations correctly."
echo ""

# Test 1: Send a simple message
echo "Test 1: Sending a simple message..."
MESSAGE_ID=$(curl -s -X POST http://localhost:3456/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Count to 5 slowly"}' \
  | jq -r '.id')

echo "Message ID: $MESSAGE_ID"
echo ""

echo "Test 2: Send a message that requires tools..."
TOOL_MESSAGE_ID=$(curl -s -X POST http://localhost:3456/message \
  -H "Content-Type: application/json" \
  -d '{"content": "What files are in the current directory?"}' \
  | jq -r '.id')

echo "Tool Message ID: $TOOL_MESSAGE_ID"
echo ""

echo "GUI Test Instructions:"
echo "====================="
echo "1. Open the GUI if not already open (bun run dev:gui)"
echo ""
echo "2. You should see processing animations for both messages:"
echo "   - Rotating Unicode symbols (⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)"
echo "   - Elapsed time counter (e.g., '2.1s')"
echo "   - Token counter updating in real-time"
echo "   - Action text like 'Thinking...' or 'Using tool: list_directory'"
echo ""
echo "3. The animation should update smoothly every 100ms"
echo ""
echo "4. Once processing completes:"
echo "   - The animation disappears"
echo "   - The response is shown"
echo "   - Metadata shows final token count and processing time"
echo ""

echo "Monitoring first message status..."
for i in {1..10}; do
  STATUS=$(curl -s http://localhost:3456/interactions/$MESSAGE_ID | jq -r '.status')
  METADATA=$(curl -s http://localhost:3456/interactions/$MESSAGE_ID | jq '.metadata')
  echo "[$i] Status: $STATUS"
  echo "     Metadata: $METADATA"
  sleep 1
  if [ "$STATUS" = "completed" ]; then
    break
  fi
done

echo ""
echo "Done!"