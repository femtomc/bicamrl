# Bicamrl Development TODO

## Current State (2025-07-16)

### Recent Achievements ✅
- **Agent Architecture**: Implemented Agent abstractions, PermissionStrategy, and provider-specific agents
- **Claude Code Integration**: Full MCP server support with isolated instances per interaction
- **Comprehensive Test Suite**: Unit and integration tests for all major components
- **Process Management**: One Wake process per interaction with health monitoring
- **Clean Architecture**: Separated Interactions (containers) from Messages (content)
- **Real-time Updates**: SSE for progress animations and token tracking

## Priority Tasks 🚀

### HIGH - Architecture Refactoring

1. **API Routes God Object** (`packages/server/src/api/routes.ts`)
   - 300+ lines mixing HTTP routing, business logic, SSE, and service initialization
   - Extract: `InteractionService`, `WorktreeService`, `PermissionService`
   - Implement dependency injection instead of hardcoded service creation
   - Remove business logic from HTTP handlers

2. **GUI God Object** (`main.rs` - 1,261 lines)
   - Extract: Network layer, SSE service, View components
   - Remove blocking async calls from UI thread (`block_on`)
   - Implement proper event bus for UI updates
   - Create reusable UI component library

3. **Type Duplication** (Server/Client/Shared)
   - Generate types from single source (OpenAPI spec)
   - Fix inconsistent field naming (camelCase vs snake_case)
   - Create proper domain models with behavior

### MEDIUM - Technical Debt

1. **GUI Compatibility Issues**
   - **Type Mismatches**:
     - MessageRole: GUI missing 'tool' role
     - MessageStatus: GUI missing 'failed' status
   - **Wrong API Endpoints**:
     - Permission endpoint: GUI uses wrong path
     - Deprecated endpoints still referenced
   - **Missing Features**:
     - No rendering of tool calls in message metadata
     - No display of failed message status

2. **Security Issues**
   - API keys in environment variables without validation
   - No input sanitization for tool arguments
   - Missing authentication/authorization

3. **Resource Management**
   - SSE connections never cleaned up
   - No connection pooling or limits
   - Memory accumulation in long-running processes

## Remaining LLM Provider Tasks

### Agent Capabilities (MEDIUM PRIORITY)
1. **Create AgenticWrapper**
   - Wrap raw LLMs (LM Studio, OpenAI) with agent capabilities
   - Implement tool calling logic for non-agentic providers

2. **Implement prompt strategies**
   - ReAct strategy for reasoning + acting
   - ToolFormer for tool usage
   - Chain-of-Thought for complex reasoning

3. **Build StandardToolSet**
   - File operations (read, write, list)
   - Shell commands (bash)
   - Search tools (grep, find)
   - Worktree-aware execution

### Advanced Features (LOW PRIORITY)
1. **Add provider configuration system**
   - Define PROVIDER_CONFIGS with capabilities
   - Runtime provider discovery

2. **Memory management**
   - Short-term memory (conversation context)
   - Long-term memory (vector store)

3. **Agent state persistence**
   - Save/restore agent state
   - Resume conversations

4. **Rich message types**
   - Implement typed message content (text, code, tool calls, errors)
   - Support multi-part messages

## Long-term Improvements

1. **SQLite Persistence Layer**
   - Replace in-memory stores with proper database
   - Add migration system
   - Implement transaction support

2. **Performance Optimization**
   - Remove blocking calls from UI thread
   - Implement list virtualization for messages
   - Add caching layer with TTL

3. **Enhanced Monitoring**
   - Add OpenTelemetry instrumentation
   - Create health check endpoints
   - Implement log aggregation

## Known Issues

### Critical (P0)
1. Server crashes on unhandled promise rejections
2. API keys stored in plain text
3. Potential command injection in tool execution

### High (P1)
1. Blocking async calls in GUI (`block_on`)
2. SSE connections never cleaned up
3. No connection limits or pooling

### Medium (P2)
1. God objects need refactoring
2. Missing API documentation
3. Inconsistent code style