# Bicamrl Server

A simplified concurrent agent server for human-AI collaboration.

## Architecture Overview

```
SessionManager
    ├── InteractionBus (message queue)
    └── WakeAgent (processes queries)
```

## Core Components

### InteractionBus (`interaction/bus.ts`)
Central message queue that manages interaction lifecycle:
- Posting new interactions
- Agents pulling work from queue
- Submitting completed work
- Emitting events for real-time updates

### Agent System (`core/agent.ts`)
Base class for processing agents with infinite loops that:
1. Pull work from InteractionBus
2. Process interactions
3. Submit results

### WakeAgent (`agents/wake.ts`)
Primary agent that:
- Processes user queries and actions
- Executes tool calls (file operations)
- Generates LLM responses

### SessionManager (`core/sessionManager.ts`)
Manages user sessions including:
- Per-session SQLite database
- Memory system
- InteractionBus instance
- Agent lifecycle

## API Endpoints

- `GET /health` - Health check
- `POST /sessions` - Create new session
- `GET /sessions` - List active sessions
- `GET /sessions/:id` - Get session details
- `POST /sessions/:id/interactions` - Send message
- `GET /sessions/:id/interactions` - Get all interactions
- `GET /sessions/:id/interactions/stream` - SSE event stream
- `GET /queue/status` - Queue statistics
- `DELETE /sessions/:id` - Close session

## Running the Server

```bash
# Development (with hot reload)
bun run dev

# Production
bun start

# Run tests
bun test
```

## Configuration

Configure via `Mind.toml` in project root:

```toml
default_provider = "mock"

[llm_providers.mock]
type = "mock"
enabled = true

[storage]
type = "sqlite"
path = ".bicamrl/memory"

[agents.wake]
enabled = true
```

## Key Design Decisions

1. **Simplified Architecture**: Removed complex review system and multiple implementations
2. **Memory Safety**: No unbounded arrays - completed interactions stored in database
3. **Single Agent**: Only Wake agent for now (Sleep removed for simplicity)
4. **Clear State Machine**: Interactions go from queued → processing → completed
5. **Event-Driven**: All updates stream via Server-Sent Events

## Development Guide

### Adding a New Agent

1. Extend the `Agent` base class
2. Implement required methods:
   - `interestedInTypes()`: Which interaction types to handle
   - `shouldProcess()`: Filter logic
   - `processInteraction()`: Main processing logic

```typescript
export class CustomAgent extends Agent {
  interestedInTypes(): InteractionType[] {
    return [InteractionType.QUERY];
  }
  
  shouldProcess(interaction: Interaction): boolean {
    return interaction.metadata?.customFlag === true;
  }
  
  async processInteraction(interaction: Interaction): Promise<any> {
    // Process and return result
    return { processed: true };
  }
}
```

### Adding Tools to Wake

Register new tools in the `initializeTools()` method:

```typescript
this.toolRegistry.register({
  name: 'my_tool',
  description: 'Does something',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string' }
    }
  },
  execute: async (params) => {
    return { output: 'result' };
  }
});
```

## Testing

```bash
# Unit tests
bun test tests/unit

# Integration tests  
bun test tests/integration

# All tests with coverage
bun test --coverage
```