# GUI Tool Permission Test Plan

## Test Setup
1. Start server: `bun run dev:server`
2. Start GUI: `cd packages/editor/gui && cargo run`
3. Ensure Claude Code is the default provider in Mind.toml

## Test Cases

### Test 1: Basic Tool Permission Flow
1. In GUI, send message: "Can you read the package.json file?"
2. Expected: 
   - Assistant responds with permission request
   - GUI shows "Tool Permission Request" with Approve/Deny buttons
   - Message status shows "waiting_for_permission"

### Test 2: Approve Permission
1. Click "Approve" button
2. Expected:
   - A message "Yes, go ahead" is sent automatically
   - Assistant executes the tool and shows the file contents
   - Message status changes to "completed"

### Test 3: Deny Permission  
1. Send another tool request: "Please write 'Hello' to test.txt"
2. When permission UI appears, click "Deny"
3. Expected:
   - A message "No, don't use that tool" is sent
   - Assistant responds acknowledging it won't use the tool
   - No file is created

### Test 4: Multiple Conversations
1. Create a new conversation
2. Send a tool request in the new conversation
3. Expected:
   - Only the active conversation shows permission UI
   - Each conversation maintains its own permission state

## Visual Checks

### Permission UI Should:
- Show tool name clearly
- Show tool description
- Have clear Approve/Deny buttons
- Match the Andromeda theme colors
- Be positioned clearly in the message flow

### Status Indicators Should:
- Show "waiting_for_permission" status correctly
- Update to "completed" after response
- Show error states if tool fails

## Edge Cases to Test
1. Send approval without a pending request - should create new message
2. Switch conversations while permission pending - UI should update
3. Rapid approve/deny clicks - should handle gracefully