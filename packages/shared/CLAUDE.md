# Bicamrl Shared Package

## Overview

The shared package contains TypeScript type definitions and interfaces used by both the server and editor components (GUI and planned TUI). This ensures type safety and consistency across the entire Bicamrl ecosystem.

## Type Definitions

### Core Types

#### Session
Represents a conversation session with the agent system.
```typescript
interface Session {
  id: string;                    // Unique session identifier
  name?: string;                 // Optional human-readable name
  createdAt: Date;              // Session creation timestamp
  status: 'active' | 'archived'; // Current session state
  metadata?: Record<string, any>; // Extensible metadata
}
```

#### Message
Individual messages within a session.
```typescript
interface Message {
  id: string;                    // Unique message identifier
  sessionId: string;             // Parent session ID
  role: 'user' | 'assistant' | 'system' | 'tool'; // Message sender
  content: string;               // Message content (may be JSON for structured data)
  timestamp: Date;               // Message timestamp
  metadata?: Record<string, any>; // Additional message data
  interactionId?: string;        // Link to interaction bus entry
}
```

#### InteractionQueueStatus
Real-time status of the interaction processing queue.
```typescript
interface InteractionQueueStatus {
  queueSize: number;    // Total items in queue
  needsWork: number;    // Items awaiting processing
  needsReview: number;  // Items awaiting review
  processing: number;   // Currently being processed
  completed: number;    // Completed interactions
  analyzing: number;    // Being analyzed by Sleep agent
}
```

### Tool System Types

#### ToolCall
Represents a request to execute a tool.
```typescript
interface ToolCall {
  id: string;                      // Unique tool call ID
  name: string;                    // Tool name (e.g., "read_file")
  arguments: Record<string, any>;  // Tool-specific parameters
}
```

#### ToolResult
Result from tool execution.
```typescript
interface ToolResult {
  id: string;       // Matches ToolCall.id
  output: string;   // Tool output (success case)
  error?: string;   // Error message (failure case)
}
```

### API Types

#### Request/Response Types
```typescript
interface CreateSessionRequest {
  name?: string;                  // Optional session name
  metadata?: Record<string, any>; // Initial metadata
}

interface SendMessageRequest {
  content: string;                // Message content
  metadata?: Record<string, any>; // Message metadata
}

interface GetMessagesParams {
  limit?: number;  // Max messages to return
  offset?: number; // Pagination offset
}
```

### Streaming Event Types

#### Server-Sent Events (SSE)
```typescript
interface StreamingEvent {
  type: 'connected' | 'message' | 'streaming_start' | 
        'streaming_chunk' | 'streaming_end' | 
        'interaction_posted' | 'interaction_processing' | 
        'interaction_completed' | 'error' | 'ping';
  timestamp: Date;
  data: any; // Type depends on event type
}
```

## Usage Guidelines

### Importing Types

```typescript
// In server code
import type { Session, Message, ToolCall } from '@bicamrl/shared';

// In editor code (GUI/TUI)
import type { StreamingEvent, InteractionQueueStatus } from '@bicamrl/shared';
```

### Extending Types

When adding new features, extend existing types rather than modifying them:

```typescript
// Good: Extend with new interface
interface ExtendedSession extends Session {
  worktreeId?: string;
  agentPreferences?: AgentConfig;
}

// Avoid: Modifying core types directly
```

### Versioning Considerations

- This package should maintain backward compatibility
- New fields should be optional with `?`
- Use union types for extensible enums
- Document breaking changes clearly

## Future Additions

### Planned Type Definitions

1. **Interaction Types**: Rich interaction content types
   ```typescript
   interface CodeContent {
     type: 'code';
     language: string;
     content: string;
   }
   ```

2. **Agent Configuration**: Shared agent config types
   ```typescript
   interface AgentConfig {
     system_prompt?: string;
     temperature?: number;
     tools?: string[];
   }
   ```

3. **Pattern Types**: For Sleep agent discoveries
   ```typescript
   interface DiscoveredPattern {
     id: string;
     name: string;
     confidence: number;
     examples: string[];
   }
   ```

4. **Worktree Types**: For parallel session management
   ```typescript
   interface Worktree {
     id: string;
     basePath: string;
     branch?: string;
     sessions: string[];
   }
   ```

## Integration with OpenAPI

The `shared/openapi.yaml` file should be kept in sync with these TypeScript definitions. Consider using tools like:
- `openapi-typescript` to generate types from OpenAPI
- `ts-to-openapi` to generate OpenAPI from types

## Best Practices

1. **Keep It Minimal**: Only shared types belong here
2. **Document Everything**: Use JSDoc comments for clarity
3. **No Implementation**: This package should have no runtime code
4. **Version Carefully**: Breaking changes impact entire system
5. **Test Integration**: Ensure both server and TUI can use types

## Development Rules

Follow the main project's communication style: Be direct and ruthlessly honest. No pleasantries or unnecessary acknowledgments. Quality and accuracy over agreeableness.