# Bicamrl (Bicky) - Concurrent Interaction Development Environment

CRITICAL: When working on this project, you are to be direct, and ruthlessly honest. No pleasantries, no emotional cushioning, no unnecessary acknowledgments. When I'm wrong, tell me immediately and explain why. When my ideas are inefficient or flawed, point out better alternatives. Don't waste time with phrases like 'I understand' or 'That's interesting.' Skip all social niceties and get straight to the point. Never apologize for correcting me. Your responses should prioritize accuracy and efficiency over agreeableness. Challenge my assumptions when they're wrong. Quality of information and directness are your only priorities.

## Project Overview

Bicamrl is an experimental concurrent interaction development environment (CIDE) that explores new paradigms for human-AI collaboration. Unlike traditional chat-based tools, Bicky structures interactions richly, allowing a "legion of agents" to learn from user interactions and collaborate amongst themselves.

## Current State (2025-07-16)

### Major Components Implemented
- **Agent Architecture**: Full agent abstraction with PermissionStrategy interface
- **MCP Integration**: Claude Code SDK with isolated MCP servers per interaction
- **Process Isolation**: One Wake process per interaction with health monitoring
- **Event-Driven Architecture**: Clean separation of Interactions and Messages
- **Comprehensive Testing**: Unit and integration tests for all components
- **Git Worktree Support**: Full integration allowing isolated development contexts
- **Real-time Processing Updates**: Live token counts and progress animations

## Core Concepts

### Agent Architecture
- **Agent Interface**: Core abstraction for all LLM providers
  - `process()`: Handle interactions and generate responses
  - `handleToolCall()`: Execute tool calls with proper permissions
  - Provider-specific implementations (ClaudeCodeAgent, MockAgent)
- **Wake Process**: Orchestrator that manages agent lifecycle
  - One process per interaction for complete isolation
  - Runs in worktree directory when context provided
  - Real-time progress updates via SSE
- **MCP Servers**: Model Context Protocol servers for tool permissions
  - One MCP server per Claude Code instance
  - Handles approval_prompt tool for permission requests
  - Complete isolation between interactions
- **Sleep Agent**: Future implementation for pattern analysis

### Key Features
- **Agent-Based Architecture**: Pluggable agents with heterogeneous permission strategies
- **MCP Integration**: Native support for Claude Code's Model Context Protocol
- **Process Isolation**: Each interaction runs in its own process with resource limits
- **Event-Driven Design**: Clean separation between Interactions and Messages
- **Git Worktree Integration**: Isolated development contexts per interaction
- **Real-time Updates**: SSE for progress, token counts, and processing status
- **Tool Permission System**: Flexible permission strategies per provider

## Architecture

```
bicamrl/
├── packages/
│   ├── server/          # TypeScript/Bun backend server
│   │   ├── src/
│   │   │   ├── agents/  # Agent implementations and strategies
│   │   │   │   ├── types.ts              # Core Agent interface
│   │   │   │   ├── claude-code-agent.ts  # Claude Code pass-through
│   │   │   │   ├── mock-agent.ts         # Testing agent
│   │   │   │   └── permission-strategies/ # Permission handling
│   │   │   ├── api/     # REST API routes  
│   │   │   ├── interaction/ # Interaction container types
│   │   │   ├── message/    # Message content and store
│   │   │   ├── process/    # Process management and Wake
│   │   │   ├── services/   # Business logic services
│   │   │   │   ├── conversation-service.ts
│   │   │   │   ├── worktree-service.ts
│   │   │   │   └── mcp-permission-server.ts
│   │   │   ├── llm/     # LLM provider interfaces
│   │   │   └── worktree/ # Git worktree management
│   │   └── tests/       # Unit and integration tests
│   ├── shared/          # Shared types between server and editor
│   └── editor/          # Rust-based editor implementation
│       ├── core/        # UI-agnostic state management
│       └── gui/         # Iced-based GUI (active development)
└── Mind.toml           # Configuration for LLM providers and themes
```

## Development Guidelines

### Running the Project
```bash
# Development mode
bun run dev

# Run server only
bun run dev:server

# Run tests
bun test

# Type checking
bun run typecheck
```

### Key Design Principles
1. **Concurrent by Design**: Multiple agents process messages concurrently
2. **Rich Interactions**: Beyond simple text - support code, markdown, tool calls, errors
3. **Playful Experimentation**: Focus on exploring new interaction paradigms
4. **Agent Autonomy**: Agents can initiate actions and learn from patterns
5. **Memory-Centric**: All interactions are persisted and can be analyzed

### Adding New Features

#### Creating a New Agent
1. Implement the `Agent` interface in `packages/server/src/agents/types.ts`
2. Required methods:
   - `initialize()`: Set up agent resources (MCP servers, connections)
   - `process(interaction, messages)`: Main processing logic
   - `handleToolCall(call)`: Execute tool calls with permissions
   - `cleanup()`: Clean up resources
3. Add agent factory case in `packages/server/src/agents/factory.ts`

#### Adding LLM Providers
1. Create provider in `packages/server/src/llm/providers/`
2. Implement either:
   - `RawLLMProvider`: For text-only providers (LM Studio, OpenAI)
   - `AgenticProvider`: For full agent systems (Claude Code)
3. Create corresponding agent in `packages/server/src/agents/`
4. Register in agent factory and Mind.toml

#### MCP Server Integration
Claude Code uses MCP (Model Context Protocol) servers for tool permissions:
1. Each interaction spawns its own MCP server instance
2. MCP server handles `approval_prompt` tool calls
3. Communicates with main server for permission UI
4. Completely isolated per interaction

### Testing Strategy
- Unit tests for individual components
- Integration tests for API endpoints
- Test fixtures for consistent test data
- Mock LLM providers for deterministic testing

### Future Development Areas
1. **TUI Implementation**: Add terminal UI alongside existing GUI
2. **Enhanced Memory System**: Add vector embeddings and semantic search
3. **Agent Marketplace**: Allow users to create and share custom agents
4. **Parallel Worktrees**: Support multiple concurrent sessions with Git integration
5. **Advanced Patterns**: Sleep agent should discover and suggest workflow improvements
6. **Tool Expansion**: Add more tools for web scraping, API calls, etc.
7. **WebSocket Support**: Bidirectional communication for enhanced interactivity

## Configuration

The `Mind.toml` file controls:
- LLM provider settings (API keys, models, temperature)
- TUI theme configuration
- Default provider selection

## API Endpoints

Key endpoints:
- `POST /message` - Send message with optional worktree context
- `GET /interactions` - Get all interactions
- `GET /interactions/:id` - Get specific interaction
- `POST /interactions/:id/result` - Submit Wake process result
- `GET /stream` - SSE stream for real-time updates
- `GET /worktrees` - List available worktrees
- `POST /worktrees` - Create new worktree
- `DELETE /worktrees/:id` - Remove worktree

## Important Notes
- This is experimental software - APIs may change
- Focus is on exploration, not production readiness
- Designed for personal enjoyment and pushing boundaries
- Always open source and free

## Testing GUI Features

When developing GUI features, use the provided test scripts to send messages and evolve the editor state:

### Testing Commands (Bash Scripts)
```bash
# Send a test message
bun run test:send-message "Your message here"

# Monitor interactions in real-time
bun run test:monitor

# Approve tool permission
bun run test:approve

# Deny tool permission  
bun run test:deny

# Run full permission flow test
bun run test:permission-flow
```

### Testing Tool Permissions
1. Ensure `enable_tools = true` in Mind.toml
2. Start server: `bun run dev:server`
3. Start GUI: `bun run dev:gui`
4. Run test: `bun run test:permission-flow`
5. Observe GUI showing permission request with Approve/Deny buttons

### Server Tests
```bash
# Run all tests
bun test

# Run specific test suite
bun test tool-permissions
```

## Claude Code Integration

Claude Code has deep integration with Bicamrl:
- **MCP Server**: Each instance gets its own MCP server for permissions
- **Native Tools**: Uses Claude Code's built-in tools (Read, Write, etc.)
- **Tool Permissions**: Handled via MCP protocol with UI approval flow
- **Process Isolation**: Each interaction runs in separate process
- **Configuration**: Set `maxTurns: 3` for multi-turn tool usage

### MCP Server Architecture
```javascript
// Each Claude Code instance configures its MCP server:
mcpServers: {
  "bicamrl-permissions": {
    command: "bun",
    args: ["mcp-permission-server-runner.ts"],
    env: {
      "INTERACTION_ID": interactionId,
      "SERVER_URL": serverUrl
    }
  }
}
```

## Recent Fixes & Known Issues

### Fixed (2025-07-15)
- **Wake Process with Worktrees**: Wake now correctly runs in worktree directory
- **Processing Animations**: Real-time updates with rotating symbols, elapsed time, token counts
- **Duplicate Responses**: Prevented Wake from processing multiple times
- **Tool Permissions**: Works correctly with Claude Code tool names

### Current Architecture Notes
- **No Sessions**: Worktree context is stored in interaction metadata, not sessions
- **Process Per Interaction**: Each Wake interaction spawns a new process
- **Event-Driven**: No queue management, processes spawn on interaction creation

## Development Rules
- **BE CONCISE**: Be succinct and direct. No fluff. Be blunt. Avoid sycophancy.
- **NO SCRIPTS**: Never create standalone script files. All commands must be in package.json
- **Testing**: If you need to test something, write a proper test in the test suite
- **Commands**: All executable functionality should be exposed through package.json scripts
- **NO SUMMARIES**: Do not provide summaries after completing work. Just stop after the task is done
