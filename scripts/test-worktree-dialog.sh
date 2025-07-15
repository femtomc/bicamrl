#!/bin/bash

echo "Testing worktree creation dialog..."

# Test 1: Create a worktree with a valid name
echo "Test 1: Creating worktree with name 'feature/test-ui'"
curl -X POST http://localhost:3456/worktrees \
  -H "Content-Type: application/json" \
  -d '{"branch": "feature/test-ui", "baseBranch": "main"}' \
  2>/dev/null | jq .

echo ""

# Test 2: Try to create a worktree with existing branch
echo "Test 2: Testing error handling - duplicate branch"
curl -X POST http://localhost:3456/worktrees \
  -H "Content-Type: application/json" \
  -d '{"branch": "test-dialog", "baseBranch": "main"}' \
  2>/dev/null | jq .

echo ""

# Test 3: List all worktrees
echo "Test 3: Listing all worktrees"
curl http://localhost:3456/worktrees 2>/dev/null | jq .