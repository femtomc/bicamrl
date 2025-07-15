# Git Worktree Implementation TODO

## ✅ UPDATE: Worktree Support Implemented! (2025-07-15)

This document tracked the implementation of Git worktree support. Most features have been completed!

### What Was Completed ✅
- Worktree manager with full lifecycle operations
- Session concept removed (replaced with worktree context in interactions)
- Worktree-aware tools with path validation
- GUI worktree creation and selection
- API endpoints for worktree management
- Comprehensive test coverage

### What Remains 🚧
- SQLite persistence (currently in-memory)
- Git status/diff integration in GUI
- Worktree deletion from GUI
- Enhanced cross-worktree agent analysis

---

## Original Implementation Plan (For Reference)

### Phase 1: Core Infrastructure
- [✅] **Worktree Manager** (`packages/server/src/worktree/`)
  - [✅] Create `manager.ts` with worktree lifecycle operations
  - [✅] Implement `git.ts` for Git worktree commands
  - [✅] Define types in `types.ts`
  - [✅] Add worktree discovery/validation

- [❌] **Session Management** ~~(`packages/server/src/session/`)~~
  - [❌] ~~Create `manager.ts` for session CRUD~~ - REMOVED: Sessions don't exist
  - [❌] ~~Implement SQLite store in `store.ts`~~ - REMOVED: Sessions don't exist
  - [❌] ~~Add session-worktree association~~ - REMOVED: Worktree is in interaction metadata
  - [❌] ~~Handle session cleanup on disconnect~~ - REMOVED: No sessions to clean up

### Phase 2: Integration
- [✅] **Update Shared Types** (`packages/shared/src/index.ts`)
  - [❌] ~~Add `worktreeId` and `worktreePath` to Session~~ - Added to interaction metadata instead
  - [✅] Create `Worktree` interface
  - [✅] Add worktree context to interactions

- [✅] **Modify InteractionBus** ~~(`packages/server/src/interaction/bus.ts`)~~ - Replaced with InteractionStore
  - [✅] Add worktreeId to interaction metadata
  - [✅] Pass worktree context through pipeline
  - [❌] ~~Update event subscriptions for session filtering~~ - No sessions

- [✅] **Update Wake Agent** (`packages/server/src/agents/wake.ts`)
  - [✅] Accept worktree context in process spawn
  - [✅] Pass worktree path to tool registry
  - [❌] ~~Filter interactions by session~~ - Wake spawns per interaction

### Phase 3: Tool Updates
- [✅] **File Tools** (`packages/server/src/tools/`)
  - [✅] Update ReadFileTool to resolve paths relative to worktree
  - [✅] Update WriteFileTool for worktree-relative paths
  - [✅] Update ListDirectoryTool for worktree context
  - [✅] Add path validation to prevent escaping worktree

### Phase 4: API Changes
- [✅/❌] **New Endpoints** (`packages/server/src/api/routes.ts`)
  - [❌] ~~`POST /sessions`~~ - REMOVED: No sessions
  - [❌] ~~`GET /sessions`~~ - REMOVED: No sessions
  - [❌] ~~`GET /sessions/:id`~~ - REMOVED: No sessions
  - [❌] ~~`POST /sessions/:id/worktree`~~ - REMOVED: No sessions
  - [❌] ~~`DELETE /sessions/:id/worktree`~~ - REMOVED: No sessions
  - [✅] `GET /worktrees` - List available worktrees
  - [✅] `POST /worktrees` - Create new worktree

- [✅] **Update Existing Endpoints**
  - [✅] `/message` accepts worktreeId in request body
  - [✅] `/interactions` returns all interactions
  - [✅] SSE stream shows all interactions (not session-scoped)

### Phase 5: GUI Updates
- [✅] **Rust GUI** (`packages/editor/gui/`)
  - [❌] ~~Add session selector in UI~~ - Shows worktree selector instead
  - [✅] Show current worktree/branch info
  - [✅] Update API client for new endpoints
  - [✅] Add worktree creation dialog

## Testing Strategy

### Unit Tests
1. **Worktree Manager Tests** (`packages/server/tests/worktree/`)
   - Test worktree creation/deletion
   - Test path validation
   - Test Git operations
   - Mock Git commands for CI

2. **Session Manager Tests** (`packages/server/tests/session/`)
   - Test session CRUD operations
   - Test session-worktree association
   - Test SQLite persistence
   - Test cleanup on disconnect

3. **Tool Context Tests** (`packages/server/tests/tools/`)
   - Test path resolution with worktree context
   - Test path escaping prevention
   - Test tool execution in different worktrees

### Integration Tests
1. **API Integration** (`packages/server/tests/api/`)
   - Test full session lifecycle
   - Test message routing to correct session
   - Test concurrent sessions
   - Test worktree switching

2. **End-to-End Tests**
   - Create session with worktree
   - Send messages that trigger file operations
   - Verify files created in correct worktree
   - Test multiple concurrent sessions

### Manual Testing Checklist
- [❌] ~~Create new session without worktree~~ - No sessions
- [❌] ~~Create new session with existing worktree~~ - No sessions
- [✅] Create new worktree
- [✅] Switch worktrees
- [✅] Run file operations in different worktrees
- [✅] Verify isolation between worktrees
- [✅] Test GUI worktree selector
- [🚧] Test persistence across server restarts - In-memory only currently

## Implementation Order
1. Start with shared types (no breaking changes)
2. Implement session management (foundation)
3. Add worktree manager (Git integration)
4. Update tools with context (careful testing)
5. Modify API routes (coordinate with GUI)
6. Update GUI last (depends on API)

## Risks and Mitigations
- **Risk**: Breaking existing functionality
  - **Mitigation**: Keep old endpoints working during transition
  
- **Risk**: Path escaping vulnerabilities
  - **Mitigation**: Strict path validation in tools
  
- **Risk**: Git worktree conflicts
  - **Mitigation**: Lock worktrees to single session

## Success Criteria
- [✅] Multiple Wake agents can operate in different Git branches
- [✅] File operations are isolated to worktree boundaries
- [🚧] ~~Sessions~~ Interactions persist across server restarts - Needs SQLite
- [✅] GUI clearly shows ~~session~~/worktree context
- [✅] All tests pass with >90% coverage (88 tests passing)

## What's Next?

With worktree support implemented, the next priorities are:

1. **SQLite Persistence** - Make worktrees and interactions survive restarts
2. **Git Integration** - Show diff/status in GUI
3. **Enhanced Sleep Agent** - Cross-worktree pattern analysis
4. **Worktree Management UI** - Delete worktrees from GUI
5. **Performance Optimization** - Handle many worktrees efficiently