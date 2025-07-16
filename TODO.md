# Bicamrl Development TODO

## Current State (2025-07-16)

### Recent Achievements ✅
- **Interaction Data Refactoring**: Eliminated redundancy, structured metadata
- **Wake Process Architecture**: Persistent per interaction, proper SSE updates
- **Process Management**: Health monitoring, automatic restarts on failure only
- **GUI Integration**: Worktree management, real-time progress animations
- **Message/Interaction Separation**: Clean architecture with Interactions as containers and Messages as content
- **Tool Execution**: Fixed Claude Code tool integration with proper argument mapping

## Priority Tasks 🚀

### URGENT - Bug Fixes

1. **Wake Process Spawning Issues** ✅ FIXED (2025-07-16)
   - Fixed PORT environment variable propagation
   - Added serverPort property to WakeProcessor
   - Updated createApp to accept port parameter
   - Fixed all integration test imports to use named export
   - Verified multi-instance server support working correctly

### HIGH - Architecture Refactoring

1. **API Routes God Object** (`packages/server/src/api/routes.ts`)
   - 300+ lines mixing HTTP routing, business logic, SSE, and service initialization
   - Extract: `InteractionService`, `WorktreeService`, `PermissionService`
   - Implement dependency injection instead of hardcoded service creation
   - Remove business logic from HTTP handlers

2. **Wake Process Complexity** (`wake-process.ts` - 440+ lines)
   - Split into: `WakeExecutor`, `SSEHandler`, `ToolExecutor`, `ProgressReporter`
   - Extract hardcoded tool mappings to configuration
   - Implement proper state machine for interaction lifecycle
   - Add error recovery and process monitoring

3. **GUI God Object** (`main.rs` - 1,261 lines)
   - Extract: Network layer, SSE service, View components
   - Remove blocking async calls from UI thread (`block_on`)
   - Implement proper event bus for UI updates
   - Create reusable UI component library

4. **Type Duplication** (Server/Client/Shared)
   - Generate types from single source (OpenAPI spec)
   - Fix inconsistent field naming (camelCase vs snake_case)
   - Create proper domain models with behavior

### MEDIUM - Technical Debt

1. **Process Management**
   - No cleanup when parent crashes - implement process tracking
   - No recovery for crashed Wake processes
   - Missing health checks and automatic restarts
   - No resource limits (can spawn unlimited processes)

2. **Error Handling**
   - Generic `process.exit(1)` without cleanup
   - Missing try-catch in critical sections
   - No retry logic for failed operations
   - Unhandled promise rejections crash the server

3. **Resource Leaks**
   - SSE connections never cleaned up
   - Orphaned worktrees on failed operations
   - No connection pooling or limits
   - Memory accumulation in long-running processes

4. **Security Issues**
   - API keys in environment variables without validation
   - No input sanitization for tool arguments
   - Hardcoded secrets in configuration
   - Missing authentication/authorization

5. **Testing Gaps**
   - No tests for error recovery
   - Missing integration tests for full flow
   - No performance regression tests
   - No security vulnerability tests

## Next Steps

### ✅ COMPLETED - Interaction/Message Architecture Refactoring (2025-07-16)

**Problem**: Architecture conflated Interaction (conversation container) with Messages (individual messages).

**Solution Implemented**: Clean separation of Interactions and Messages:

#### Phase 1: Core Data Model ✅
- Created simplified Interaction as conversation container (types-v2.ts)
- Created Message model with role, status, and metadata (message/types.ts)
- Created MessageStore with event emissions (message/store.ts)
- Created ConversationService to coordinate (services/conversation-service.ts)

#### Phase 2: Wake Process Updates ✅
- Updated Wake to listen for message:added events (processor-v2.ts)
- Simplified lifecycle - one process per interaction
- Fixed tool execution with argument mapping

#### Phase 3: API Updates ✅
- Updated /message endpoint to use ConversationService
- Added message status updates
- Maintained backward compatibility

#### Phase 4: Cleanup ✅
- Removed all V1 files
- Updated tests for new architecture
- Fixed tool execution for Claude Code

### Next Architecture Tasks

1. **Rich Message Types**
   - Implement typed message content (text, code, tool calls, errors)
   - Support multi-part messages
   - Add proper tool result handling

3. **GUI Compatibility**
   - Complete interaction serialization fixes
   - Ensure flat structure for GUI expectations
   - Remove all legacy compatibility code

## Long-term Improvements

1. **SQLite Persistence Layer**
   - Replace in-memory stores with proper database
   - Add migration system
   - Implement transaction support
   - Add connection pooling

2. **Security Hardening**
   - Move secrets to secure vault
   - Add input validation and sanitization
   - Implement rate limiting
   - Add authentication/authorization
   - Security audit all endpoints

3. **Performance Optimization**
   - Remove blocking calls from UI thread
   - Implement list virtualization for messages
   - Add caching layer with TTL
   - Reduce excessive cloning in Rust (76 instances)
   - Profile and optimize hot paths

4. **Enhanced Monitoring**
   - Add OpenTelemetry instrumentation
   - Create health check endpoints
   - Implement log aggregation
   - Add performance metrics
   - Create alerting rules

5. **Developer Experience**
   - Add API documentation
   - Create architecture diagrams
   - Establish consistent code style
   - Write contribution guidelines

## Known Issues

### Critical (P0)
1. Wake processes can leak if parent crashes
2. Server crashes on unhandled promise rejections
3. API keys stored in plain text
4. Potential command injection in tool execution

### High (P1)
1. Blocking async calls in GUI (`block_on`)
2. 50+ uses of `any` type across codebase
3. SSE connections never cleaned up
4. No connection limits or pooling

### Medium (P2)
1. God objects need refactoring
2. Missing API documentation
3. Inconsistent code style
4. No configuration hot-reloading

## Completed Refactoring ✅

### Interaction Data Structure (2025-07-15)

#### Phase 1: Eliminate Redundancy (Week 1) ✅ COMPLETED
1. **Remove duplicate response storage** ✅
   - Deleted `result.response` from completed state
   - Response now retrieved from last assistant message
   - Removed metadata duplication

2. **Centralize model/usage info** ✅
   - Stored only in structured metadata
   - Removed from state.result
   - Created clear accessor methods

#### Phase 2: Structured Metadata (Week 1) ✅ COMPLETED
Implemented in `metadata-types.ts`:
```typescript
interface InteractionMetadata {
  // Permanent context
  context?: {
    worktreeId?: string;
    sessionId?: string;
    environment?: Record<string, any>;
  };
  
  // Processing state (temporary)
  processing?: {
    currentAction?: string;
    startedAt?: Date;
    processor?: string;
  };
  
  // Result metadata (permanent)
  result?: {
    model?: string;
    usage?: TokenUsage;
    processingTimeMs?: number;
    toolsUsed?: string[];
  };
}
```