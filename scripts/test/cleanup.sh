#!/bin/bash

# Cleanup script to kill existing servers and clean test artifacts
# Usage: ./cleanup.sh

# Kill all processes on port 3456
lsof -ti:3456 | xargs kill -9 2>/dev/null || true

# Kill any hanging bun processes
pkill -f "bun run --hot" 2>/dev/null || true

# Clean up test files
rm -f test.txt 2>/dev/null || true
rm -f test-server.log 2>/dev/null || true

echo "Cleanup complete"