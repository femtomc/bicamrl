# Bicamrl Editor Package

## Overview

The editor package contains frontend implementations for interacting with the Bicamrl server. It's structured to support multiple UI paradigms while sharing core logic.

## Structure

```
editor/
├── core/          # UI-agnostic state management
│   ├── state      # Application state definition
│   ├── actions    # All possible user actions
│   ├── reducer    # Pure state transitions
│   ├── effects    # Side effects (API calls)
│   └── tests/     # Comprehensive state tests
│
├── gui/           # Iced-based graphical interface
│   ├── api        # HTTP/SSE client
│   ├── app        # Main application using core
│   └── types      # API type definitions
│
└── tui/           # Terminal UI (future)
```

## Design Principles

1. **Separation of Concerns**: Core logic is completely separate from UI rendering
2. **Testability**: All state transitions can be tested without any UI
3. **Reusability**: Same core powers GUI, TUI, CLI, etc.
4. **Type Safety**: Strong typing throughout with Rust

## Core State Management

The `core` package implements a Redux-like state machine:
- Actions represent user intents
- Reducer is a pure function (testable!)
- Effects handle async operations
- State is immutable

This means we can:
- Test every possible user interaction
- Replay action sequences
- Debug by examining action logs
- Ensure consistent behavior across UIs

## Current Status

- ✅ Core state management with full test coverage
- ✅ Iced-based GUI with interaction support
- ✅ SSE integration for real-time updates
- ✅ Performance optimized (98% fewer requests)
- ✅ Tool permission flow with Approve/Deny UI
- ✅ Ubuntu-style interaction naming
- ✅ Unicode spinner with custom colors
- 📋 TUI implementation
- 📋 Richer interaction editing (multi-part content)
- 📋 Advanced review workflow UI

## Running Tests

```bash
# Test core state management
bun run test:core

# Run GUI
bun bicky
```

## Development Rules

Follow the main project's communication style: Be direct and ruthlessly honest. No pleasantries or unnecessary acknowledgments. Quality and accuracy over agreeableness.