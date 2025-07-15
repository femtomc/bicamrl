# Code Quality Guide

## Overview

This project maintains high code quality standards through automated linting, type checking, and formatting for both TypeScript and Rust code.

## Quick Commands

```bash
# Run all checks (recommended before commits)
bun run check

# Run all checks in parallel (faster)
bun run check:fast

# Auto-fix issues
bun run lint:fix
bun run fmt

# Pre-commit hook
bun run pre-commit
```

## TypeScript (Bun)

### Type Checking
```bash
bun run typecheck:ts
```
- Uses TypeScript compiler in strict mode
- Checks all `.ts` files in `packages/server/src`
- Configuration: `packages/server/tsconfig.json`

### Linting
```bash
bun run lint:ts      # Check for issues
bun run lint:fix:ts  # Auto-fix issues
```
- Uses ESLint with TypeScript parser
- Rules: recommended + custom rules for consistency
- Configuration: `packages/server/.eslintrc.json`

### Formatting
```bash
bun run fmt:ts       # Format code
bun run fmt:check:ts # Check formatting
```
- Uses Prettier for consistent code style
- Configuration: `packages/server/.prettierrc`

## Rust (Cargo)

### Type Checking
```bash
bun run typecheck:rust
```
- Uses `cargo check` for fast type checking
- Checks all Rust code in `packages/editor/gui`

### Linting
```bash
bun run lint:rust      # Check with Clippy
bun run lint:fix:rust  # Auto-fix issues
```
- Uses Clippy with strict settings
- Warns on: all, pedantic, nursery, cargo lints
- Configuration: `packages/editor/gui/clippy.toml`

### Formatting
```bash
bun run fmt:rust       # Format code
bun run fmt:check:rust # Check formatting
```
- Uses rustfmt for consistent Rust style
- Configuration: `packages/editor/gui/rustfmt.toml`

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Install dependencies
  run: bun install

- name: Type check
  run: bun run typecheck

- name: Lint
  run: bun run lint

- name: Format check
  run: bun run fmt:check

- name: Tests
  run: bun test
```

## Git Hooks

Set up pre-commit hook:

```bash
#!/bin/sh
# .git/hooks/pre-commit

bun run pre-commit
```

## Editor Integration

### VS Code
Install extensions:
- ESLint
- Prettier
- rust-analyzer

Settings (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer"
  }
}
```

### Neovim
Use LSP configs:
- typescript-language-server
- rust-analyzer
- eslint
- prettier

## Code Standards

### TypeScript
- Use single quotes
- Always use semicolons
- 2-space indentation
- Max line width: 100
- Trailing commas in multi-line

### Rust
- 4-space indentation
- Max line width: 100
- Group imports by std/external/crate
- Use field init shorthand
- Format code in doc comments

## Common Issues

### "ESLint not found"
```bash
cd packages/server && bun install
```

### "Clippy warnings as errors"
Fix the warnings or temporarily allow:
```bash
cd packages/editor/gui && cargo clippy
```

### "Format check failed"
Auto-fix formatting:
```bash
bun run fmt
```