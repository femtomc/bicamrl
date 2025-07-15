# Git Worktree Implementation TODO

## Overview
Implement Git worktree support to enable multiple concurrent sessions with isolated file system contexts. Each session can be linked to a Git worktree, allowing Wake agents to operate in different branches/states simultaneously.

## Implementation Plan

### Phase 1: Core Infrastructure
- [ ] **Worktree Manager** (`packages/server/src/worktree/`)
  - [ ] Create `manager.ts` with worktree lifecycle operations
  - [ ] Implement `git.ts` for Git worktree commands
  - [ ] Define types in `types.ts`
  - [ ] Add worktree discovery/validation

- [ ] **Session Management** (`packages/server/src/session/`)
  - [ ] Create `manager.ts` for session CRUD
  - [ ] Implement SQLite store in `store.ts`
  - [ ] Add session-worktree association
  - [ ] Handle session cleanup on disconnect

### Phase 2: Integration
- [ ] **Update Shared Types** (`packages/shared/src/index.ts`)
  - [ ] Add `worktreeId` and `worktreePath` to Session
  - [ ] Create `Worktree` interface
  - [ ] Add session context to interactions

- [ ] **Modify InteractionBus** (`packages/server/src/interaction/bus.ts`)
  - [ ] Add sessionId to interactions
  - [ ] Pass session context through pipeline
  - [ ] Update event subscriptions for session filtering

- [ ] **Update Wake Agent** (`packages/server/src/agents/wake.ts`)
  - [ ] Accept session context in constructor
  - [ ] Pass worktree path to tool registry
  - [ ] Filter interactions by session

### Phase 3: Tool Updates
- [ ] **File Tools** (`packages/server/src/tools/`)
  - [ ] Update ReadFileTool to resolve paths relative to worktree
  - [ ] Update WriteFileTool for worktree-relative paths
  - [ ] Update ListDirectoryTool for worktree context
  - [ ] Add path validation to prevent escaping worktree

### Phase 4: API Changes
- [ ] **New Endpoints** (`packages/server/src/api/routes.ts`)
  - [ ] `POST /sessions` - Create session with optional worktree
  - [ ] `GET /sessions` - List all sessions
  - [ ] `GET /sessions/:id` - Get session details
  - [ ] `POST /sessions/:id/worktree` - Create/attach worktree
  - [ ] `DELETE /sessions/:id/worktree` - Detach worktree
  - [ ] `GET /worktrees` - List available worktrees

- [ ] **Update Existing Endpoints**
  - [ ] Change `/message` to `/sessions/:id/message`
  - [ ] Change `/interactions` to `/sessions/:id/interactions`
  - [ ] Update SSE stream to be session-scoped

### Phase 5: GUI Updates
- [ ] **Rust GUI** (`packages/editor/gui/`)
  - [ ] Add session selector in UI
  - [ ] Show current worktree/branch info
  - [ ] Update API client for new endpoints
  - [ ] Add worktree creation dialog

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
- [ ] Create new session without worktree
- [ ] Create new session with existing worktree
- [ ] Create new worktree for session
- [ ] Switch worktrees mid-session
- [ ] Run file operations in different worktrees
- [ ] Verify isolation between sessions
- [ ] Test GUI worktree selector
- [ ] Test persistence across server restarts

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
- Multiple Wake agents can operate in different Git branches
- File operations are isolated to worktree boundaries
- Sessions persist across server restarts
- GUI clearly shows session/worktree context
- All tests pass with >90% coverage