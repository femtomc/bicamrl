# Bicamrl Architecture

## Overview

Bicamrl is a concurrent interaction development environment (CIDE) that reimagines human-AI collaboration through structured interactions and multi-agent processing.

## System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   GUI (Iced)    │     │   TUI (Rust)    │     │   CLI (Bun)     │
│                 │     │   (planned)      │     │   (planned)      │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                         │
         └───────────────────────┴─────────────────────────┘
                                 │
                          REST API + SSE
                                 │
┌────────────────────────────────┴─────────────────────────────────┐
│                         Server (Bun/TypeScript)                   │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │ Interaction │    │   Agent System    │    │  LLM Service  │  │
│  │     Bus     │◄───┤  - Wake Agent     │◄───┤  - Claude     │  │
│  │             │    │  - Sleep Agent    │    │  - OpenAI     │  │
│  │  ┌───────┐  │    │  - Custom Agents  │    │  - LM Studio  │  │
│  │  │ Queue │  │    └──────────────────┘    └───────────────┘  │
│  │  └───────┘  │                                                 │
│  └─────────────┘    ┌──────────────────┐    ┌───────────────┐  │
│                     │   Tool Registry   │    │    Memory     │  │
│                     │  - Read/Write     │    │   (SQLite)    │  │
│                     │  - Directory List  │    │               │  │
│                     └──────────────────┘    └───────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Interaction Bus
- Central message passing system
- All agents can observe and process interactions
- Supports multiple interaction types (Query, Action, Observation, Feedback)
- Implements permission system for tool usage
- Emits real-time events via SSE

### 2. Agent System
- **Wake Agent**: Active processor handling user queries
- **Sleep Agent**: Passive observer learning patterns (planned)
- Concurrent processing with state management
- Tool integration with permission requests

### 3. LLM Service
- Abstraction layer for multiple providers
- Supports Claude (via SDK), OpenAI, and LM Studio
- Configurable through Mind.toml
- Handles tool calls and streaming

### 4. Frontend Architecture
- **GUI**: Iced-based with real-time SSE updates
- **State Management**: Redux-like pattern with Actions/Reducers
- **Performance**: SSE replaces polling (98% fewer requests)
- **Caching**: Smart interaction cache for incremental updates

## Data Flow

### 1. User Interaction Flow
```
User Input → GUI → REST API → Interaction Bus → Agent Queue
                                    ↓
                            Agent Processing
                                    ↓
                        Tool Permission Request?
                              ↙         ↘
                         Yes              No
                          ↓                ↓
                   Wait for User      Complete
                          ↓
                   User Approves/Denies
                          ↓
                   Execute Tool
                          ↓
                     Complete
```

### 2. Real-time Updates
```
Server Event → SSE Stream → GUI Subscription → State Update → UI Render
```

## Performance Optimizations

### Before (Polling)
- 60 requests/second (3,600/minute)
- Fetched all data every time
- High CPU and network usage
- No real-time capabilities

### After (SSE + Caching)
- 1 SSE connection + targeted fetches
- ~60 requests/minute (98% reduction)
- Incremental updates only
- Real-time event delivery
- Smart caching with update detection

## Security Model

### Tool Permissions
- All tool usage requires explicit user approval
- Permission requests include tool description and arguments
- Permissions are per-interaction, not persistent
- Clear UI indicators for pending permissions

### API Security
- Session-based interaction tracking
- Input validation with Zod schemas
- Rate limiting (planned)
- Audit logging for all tool usage

## Scalability Considerations

### Current Capabilities
- Handles 100+ concurrent SSE connections
- Sub-100ms latency under normal load
- Efficient memory usage with interaction caching
- Horizontal scaling possible with Redis (planned)

### Future Enhancements
1. WebSocket support for bidirectional communication
2. Distributed agent processing
3. Vector database for semantic memory
4. Multi-tenancy support
5. Agent marketplace

## Technology Stack

### Backend
- **Runtime**: Bun (fast, native TypeScript)
- **Framework**: Hono (lightweight, fast)
- **Database**: SQLite (embedded, simple)
- **Validation**: Zod (type-safe schemas)

### Frontend
- **GUI Framework**: Iced (Rust, native performance)
- **Language**: Rust (memory safe, fast)
- **Async**: Tokio (concurrent operations)
- **Styling**: Custom theme system

### Development
- **Testing**: Bun test + custom benchmarks
- **Linting**: ESLint (TS) + Clippy (Rust)
- **Formatting**: Prettier (TS) + rustfmt (Rust)
- **CI/CD**: GitHub Actions (planned)