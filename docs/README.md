# Bicamrl Documentation

Welcome to the Bicamrl documentation! This directory contains all the technical documentation, guides, and references for the project.

## 📚 Documentation Structure

### Core Documentation
- **[PROJECT_INSTRUCTIONS.md](./PROJECT_INSTRUCTIONS.md)** - Core project rules and development guidelines (formerly CLAUDE.md)
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture and design decisions
- **[API.md](./API.md)** - REST API and SSE endpoint documentation

### Development Guides
- **[CODE_QUALITY.md](./CODE_QUALITY.md)** - Linting, formatting, and code standards
- **[TESTING.md](./TESTING.md)** - Comprehensive testing guide and performance benchmarks
- **[TODO.md](./TODO.md)** - Project roadmap and pending features
- **[GUI_MANUAL_TESTING.md](./GUI_MANUAL_TESTING.md)** - Manual testing procedures for GUI features

### Implementation Details
- **[ICED_PATTERNS.md](./ICED_PATTERNS.md)** - GUI implementation patterns and best practices
- **[TOOLS.md](./TOOLS.md)** - Available tools and their usage

### Package-Specific Docs
- **[packages/server/README.md](../packages/server/README.md)** - Server implementation details
- **[packages/editor/CLAUDE.md](../packages/editor/CLAUDE.md)** - Editor package overview
- **[packages/editor/core/CLAUDE.md](../packages/editor/core/CLAUDE.md)** - Core state management details
- **[packages/shared/CLAUDE.md](../packages/shared/CLAUDE.md)** - Shared types documentation

## 🚀 Quick Start

1. Read [PROJECT_INSTRUCTIONS.md](./PROJECT_INSTRUCTIONS.md) for development rules
2. Check [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system
3. Follow [CODE_QUALITY.md](./CODE_QUALITY.md) for code standards
4. Run tests as described in [TESTING.md](./TESTING.md)

## 📊 Key Metrics

From our performance optimizations:
- **98% reduction** in HTTP requests (3,600 → 60 per minute)
- **65% lower** average latency
- **Real-time** updates via SSE
- **Scales to 100+** concurrent clients

## 🛠️ Development Commands

```bash
# Quality checks
bun run check        # Run all checks
bun run lint:fix     # Fix linting issues
bun run fmt          # Format code

# Testing
bun run test         # Run tests
bun run benchmark    # Performance comparison
bun run test:load    # Load testing

# Development
bun run dev          # Start dev environment
bun run build        # Build for production
```

## 📝 Documentation Guidelines

When adding new documentation:
1. Place it in this `docs/` directory
2. Use clear, descriptive filenames
3. Add an entry to this README
4. Follow Markdown best practices
5. Include code examples where relevant

## 🔗 External Resources

- [Bun Documentation](https://bun.sh/docs)
- [Iced GUI Framework](https://github.com/iced-rs/iced)
- [Claude SDK](https://github.com/anthropics/anthropic-sdk-typescript)