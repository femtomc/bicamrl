# Tool System with Permission Prompts

## Overview

Bicamrl implements a tool system similar to Claude Code's SDK, where users can grant or deny permission for tool invocations. This ensures users maintain control over what actions the AI agents can perform on their system.

## How It Works

1. **Tool Registration**: Tools are registered with the Wake agent at startup
2. **Permission Prompts**: Before executing any tool, the system emits a permission request
3. **User Approval**: Users can approve or deny the tool execution
4. **Tool Execution**: If approved, the tool executes and returns results
5. **Result Integration**: Tool results are integrated back into the conversation

## Current Implementation

### Built-in Tools

- `read_file` - Read file contents from the filesystem
- `write_file` - Write content to files
- `list_directory` - List directory contents

### Permission Flow

```typescript
// When a tool is about to be executed:
await this.interactionBus.emitEvent({
  type: 'tool_permission_request',
  timestamp: new Date(),
  data: {
    toolName: 'read_file',
    description: 'Read the contents of a file from the filesystem',
    arguments: { path: '/etc/hosts' },
    requestId: 'unique-id'
  }
});
```

### Current Status

- ✅ Tool infrastructure implemented
- ✅ Permission prompt system in place
- ⚠️  Currently auto-approves in development mode
- 🔄 GUI integration for permission prompts (TODO)

## Enabling Tools

Tools are disabled by default. To enable:

```bash
# Start server with tools enabled
ENABLE_TOOLS=true bun run dev:server

# Test tool usage
ENABLE_TOOLS=true bun run tests/test-tools.ts
```

## Future Enhancements

1. **GUI Permission Dialog**: Show permission prompts in the GUI with approve/deny buttons
2. **Permission Memory**: Remember user preferences for specific tools
3. **Tool Allowlist/Blocklist**: Configure which tools are allowed by default
4. **Custom Tools**: Allow users to register their own tools
5. **Tool Sandboxing**: Run tools in restricted environments for safety

## Example Custom Permission Handler

```typescript
const toolRegistry = new ToolRegistry(async (request) => {
  // In production, this would show a UI prompt
  console.log(`Tool ${request.toolName} wants to execute`);
  console.log(`Arguments:`, request.arguments);
  
  // Wait for user input via GUI/CLI
  const userResponse = await getUserApproval(request);
  
  return {
    requestId: request.requestId,
    approved: userResponse.approved,
    reason: userResponse.reason
  };
});
```

## Security Considerations

- Tools should validate all inputs
- File operations should respect user permissions
- Network operations should be restricted to allowed domains
- All tool executions should be logged for audit trails