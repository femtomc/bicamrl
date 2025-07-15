# Bicamrl Development TODO

## Recent Work: Git Worktree Support (2025-07-15)

### CRITICAL UPDATE: Session Concept Removed ⚠️

User feedback revealed that Sessions were an old concept that should not exist in the codebase. The core unit of interaction is an Interaction, not a Session. All Session-related code has been removed and worktree context is now part of Interaction metadata.

### Completed ✅

#### Core Infrastructure
- **Worktree Manager** (`packages/server/src/worktree/`)
  - Manages Git worktree lifecycle with creation, deletion, and validation
  - Syncs with actual Git worktrees on disk
  - Path validation to ensure worktrees stay within repo boundaries
  
- **Removed Session Management** ~~(`packages/server/src/session/`)~~
  - ~~Session CRUD operations with worktree associations~~
  - ~~In-memory store implementation (SQLite planned for future)~~
  - ~~Session-to-worktree mapping for context isolation~~
  - **REMOVED**: Sessions were an old concept, worktree context is now in Interaction metadata

#### API Updates
- ~~Session endpoints~~ **REMOVED**
  
- Worktree endpoints:
  - `GET /worktrees` - List available worktrees
  - `POST /worktrees` - Create new worktree
  
- Updated operations:
  - `POST /message` - Send message with optional worktreeId in request
  - `GET /interactions` - Get all interactions
  - `GET /interactions/stream` - SSE stream for all interactions

#### Tool Modifications
- Created `WorktreeAwareTool` base class for path resolution
- Updated file tools (ReadFile, WriteFile, ListDirectory) to:
  - Resolve relative paths within worktree
  - Validate paths don't escape worktree boundary
  - Return paths relative to worktree root for cleaner output

#### GUI Updates
- Removed all Session-related code:
  - Replaced sessions with current_worktree and available_worktrees tracking
  - Active conversation shows 🌿 branch name if worktree selected
  - Main content header displays current worktree info or "Create Worktree" button
  - Worktree context sent with each message request
- Updated API integration:
  - GUI loads worktrees on startup
  - SSE connection starts immediately (not per-session)
  - Worktree ID included in SendMessageRequest

#### Comprehensive Tests
- Worktree manager tests (creation, deletion, sync)
- ~~Session manager tests~~ **REMOVED**
- Worktree-aware tool tests (path resolution, boundary validation)
- API endpoint tests (updated to remove session references)
- Integration flow tests

### Recent Accomplishments ✅

#### GUI Worktree Management (2025-07-15)
- **COMPLETED**: Full worktree creation dialog with form inputs and error handling
- **COMPLETED**: Worktree selection UI with quick switching between branches
- **COMPLETED**: Visual indicators for current worktree in header and sidebar
- **COMPLETED**: Success/error notifications with auto-dismiss
- **COMPLETED**: Tests for GUI worktree features
- **COMPLETED**: Manual test script for GUI worktree functionality

#### InteractionBus Refactoring (2025-07-15)
- **COMPLETED**: Replaced complex InteractionBus with simpler InteractionStore
- **COMPLETED**: Event-driven Wake process spawning (no queue management)
- **COMPLETED**: Fixed token tracking in API responses
- **COMPLETED**: Fixed all test failures (88 passing, 0 failing)

#### Wake Process & Tool Permission Fixes (2025-07-15)
- **COMPLETED**: Fixed message loops when Wake process submits permission requests
- **COMPLETED**: Handle Claude Code tool names (TodoRead, Read, Write, etc.) properly
- **COMPLETED**: Bash test scripts now work with both mock and Claude Code providers
- **COMPLETED**: Added safeguards against infinite permission request loops
- **COMPLETED**: Tool permission flow works correctly with Claude Code SDK

#### Full Stack Integration Tests (2025-07-15)
- **COMPLETED**: Added integration tests for Wake process spawning with worktree context
- **COMPLETED**: Added tests for concurrent Wake processes in different worktrees
- **COMPLETED**: Verified full stack works correctly (server → Wake process → interactions → worktrees)

### Recently Completed ✅

#### Editor Package Organization & Cleanup (2025-07-15)

✅ Removed obsolete iced editor implementation:
- **REMOVED**: packages/editor/iced (outdated code)
- **CLEANED**: Submodule references from .gitmodules
- **ACTIVE**: GUI development continues in packages/editor/gui
- **MAINTAINED**: Core state management in packages/editor/core

#### Worktree Creation Dialog & GUI Improvements (2025-07-15)

✅ Implemented full worktree management UI:
- **Creation Dialog**:
  - Branch name input field
  - Base branch selection dropdown (defaults to "main")
  - Optional custom path
  - Error display when creation fails
  - Success notification with worktree details
  - Notification auto-dismiss after 5 seconds
  - Clean overlay with semi-transparent background
  - Cancel and Create buttons with proper styling

- **Worktree Selection UI**:
  - Current worktree display in header
  - Quick switch buttons for other worktrees
  - Shows up to 3 worktrees with "(+N more)" indicator
  - Active worktree shown with 🌿 icon in sidebar
  - Worktree context passed to all interactions

- **Testing**:
  - Added GUI worktree selection tests
  - Created manual test script for GUI features
  - Verified worktree context in interactions

### Future Enhancements 📋

#### Architecture Improvements
1. **Per-Worktree Agent Contexts**
   - Currently single global Wake agent
   - Need worktree-aware agent contexts
   - Agent state persistence per worktree

2. **SQLite Persistence**
   - Replace in-memory stores
   - Worktree data survives restarts
   - Interaction history storage with worktree context

3. **Enhanced GUI Features**
   - Worktree status indicator (active/inactive)
   - Branch switching UI
   - Worktree deletion from GUI
   - Git status integration

4. **Multi-Agent Coordination**
   - Sleep agent observing patterns across worktrees
   - Cross-worktree insights
   - Workflow suggestions based on patterns

## Project Vision

Bicamrl enables "legion of agents" collaboration through:
- **Git worktree contexts**: Each interaction can have isolated Git worktree context
- **Rich interactions**: Beyond chat - code, tools, observations, feedback
- **Agent autonomy**: Wake processes, Sleep observes patterns
- **Playful experimentation**: Pushing boundaries of human-AI collaboration

The Git worktree support is a key step toward the vision of Wake fragments operating across different universes (branches), with Sleep as the omniscient observer finding patterns and improving workflows.

## Development Guidelines

- **BE CONCISE**: Direct communication, no fluff
- **NO SCRIPTS**: All commands in package.json
- **Testing**: Write proper tests, no standalone scripts
- **NO SUMMARIES**: Complete work without summarizing

## Next Steps

### Completed Recently ✅
1. ✅ Implement Wake process per interaction - spawn new process for each interaction with proper cwd
2. ✅ Replace InteractionBus with simpler InteractionStore
3. ✅ Fix all test failures - 88 tests passing, 0 failing
4. ✅ Add full integration tests for complete stack
   - ✅ Test Wake process spawning with worktree context
   - ✅ Test multi-worktree concurrent Wake processes
5. ✅ Implement worktree creation dialog in GUI
6. ✅ Complete worktree selection UI in GUI
7. ✅ Clean up obsolete iced editor code

### Priority Tasks 🚀
1. **Implement SQLite persistence layer** - Replace in-memory stores for durability
   - Interaction history persistence
   - Worktree state persistence
   - Agent memory storage
2. **Add Git status/diff integration** - Show worktree state in GUI
3. **Enhance Sleep Agent** - Analyze patterns across worktrees
4. **Enhance Sleep agent** - Analyze cross-worktree patterns and suggest workflows
5. **Add worktree deletion UI** - Allow removing worktrees from GUI
6. **Add worktree status indicators** - Show clean/dirty state
7. **Test error handling and recovery** - Full stack error resilience

### Future Enhancements 🔮
1. **WebSocket support** - Replace SSE with bidirectional communication
2. **Agent marketplace** - Share custom agents
3. **Vector embeddings** - Semantic search in memory system
4. **Multi-model support** - Use different models for different agents
5. **TUI implementation** - Terminal interface alongside GUI