# Bicamrl (Bicky) - Concurrent Interaction Development Environment

CRITICAL: When working on this project, you are to be direct, and ruthlessly honest. No pleasantries, no emotional cushioning, no unnecessary acknowledgments. When I'm wrong, tell me immediately and explain why. When my ideas are inefficient or flawed, point out better alternatives. Don't waste time with phrases like 'I understand' or 'That's interesting.' Skip all social niceties and get straight to the point. Never apologize for correcting me. Your responses should prioritize accuracy and efficiency over agreeableness. Challenge my assumptions when they're wrong. Quality of information and directness are your only priorities.

## Project Overview

Bicamrl is an experimental concurrent interaction development environment (CIDE) that explores new paradigms for human-AI collaboration. Unlike traditional chat-based tools, Bicky structures interactions richly, allowing a "legion of agents" to learn from user interactions and collaborate amongst themselves.

## Current State (2025-07-15)

### Major Components Implemented
- **InteractionStore**: Simplified from InteractionBus - handles storage and events
- **Git Worktree Support**: Full integration allowing isolated development contexts
- **Wake Process Architecture**: Event-driven spawning per interaction
- **GUI with Worktree Management**: Complete UI for creating/selecting worktrees
- **Real-time Processing Updates**: Live token counts and progress animations
- **Tool Permission System**: Works with both mock and Claude Code providers

## Core Concepts

### Wake and Sleep Architecture
- **Wake Agent**: Active processor that handles user queries and performs actions
  - Spawns as separate process per interaction for isolation
  - Runs in worktree directory when worktree context provided
  - Supports real-time progress updates during processing
- **Sleep Agent**: Passive observer that analyzes patterns and provides feedback to improve Wake's performance
- **InteractionStore**: Simplified storage + event system (replaced complex InteractionBus)

### Key Features
- Rich interaction types beyond simple chat (queries, actions, observations, feedback)
- Git worktree integration for isolated development contexts
- Pluggable LLM providers (Claude Code, Mock for testing)
- Tool system with worktree-aware file operations
- Real-time updates via Server-Sent Events (SSE)
- Processing animations with live token counts
- Tool permission flow with UI approval/denial

## Architecture

```
bicamrl/
├── packages/
│   ├── server/          # TypeScript/Bun backend server
│   │   ├── src/
│   │   │   ├── agents/  # Wake and Sleep agent implementations
│   │   │   ├── api/     # REST API routes  
│   │   │   ├── interaction/ # Interaction types and store
│   │   │   ├── llm/     # LLM provider abstraction
│   │   │   ├── tools/   # Tool registry and implementations
│   │   │   └── worktree/ # Git worktree management
│   │   └── tests/       # Comprehensive test suite
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
1. Extend the `Agent` base class in `packages/server/src/core/agent.ts`
2. Implement required abstract methods:
   - `interestedInTypes()`: Declare which interaction types to process
   - `checkTriggers()`: Define when the agent should run
   - `isRelevantInteraction()`: Filter interactions
   - `processInteraction()`: Main processing logic
   - `wantsToReview()`: Decide if agent should review results

#### Adding LLM Providers
1. Create new provider in `packages/server/src/llm/providers/`
2. Implement the LLM provider interface
3. Register in `packages/server/src/llm/service.ts`
4. Add configuration to `Mind.toml`

#### Extending Interaction Types
1. Add new types to `packages/server/src/interaction/types.ts`
2. Create content type helpers in `packages/server/src/interaction/content-types.ts`
3. Update agents to handle new interaction types

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

When using Claude Code as the LLM provider:
- Claude Code SDK uses its own tools (Read, Write, etc.) 
- Set `maxTurns` > 1 to allow tool use (we use 3)
- Tool calls are extracted from SDK messages
- Permission requests work through Bicamrl's interaction flow

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
