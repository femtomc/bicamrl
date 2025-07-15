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

### In Progress 🚧

#### Worktree Creation Dialog
- Need to implement proper dialog UI in GUI
- Branch name input field
- Base branch selection
- Custom path option

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

1. Implement worktree creation dialog in GUI
2. Add per-worktree Wake agent contexts
3. Implement SQLite persistence layer
4. Add Git status/diff integration to show worktree state
5. Enhance Sleep agent to analyze cross-worktree patterns
6. Fix remaining TypeScript compilation errors