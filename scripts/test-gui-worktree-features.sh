#!/bin/bash

echo "GUI Worktree Features Manual Test"
echo "================================="
echo ""
echo "This script helps manually test the GUI worktree features."
echo ""

# Step 1: Create some test worktrees
echo "Step 1: Creating test worktrees..."
curl -X POST http://localhost:3456/worktrees \
  -H "Content-Type: application/json" \
  -d '{"branch": "feature/test-1", "baseBranch": "main"}' \
  2>/dev/null | jq -r '.branch' | xargs -I {} echo "Created worktree: {}"

curl -X POST http://localhost:3456/worktrees \
  -H "Content-Type: application/json" \
  -d '{"branch": "feature/test-2", "baseBranch": "main"}' \
  2>/dev/null | jq -r '.branch' | xargs -I {} echo "Created worktree: {}"

curl -X POST http://localhost:3456/worktrees \
  -H "Content-Type: application/json" \
  -d '{"branch": "bugfix/test-3", "baseBranch": "main"}' \
  2>/dev/null | jq -r '.branch' | xargs -I {} echo "Created worktree: {}"

echo ""
echo "Step 2: Listing all worktrees..."
curl http://localhost:3456/worktrees 2>/dev/null | jq -r '.[] | "\(.branch) - \(.path)"'

echo ""
echo "Step 3: GUI Testing Instructions"
echo "--------------------------------"
echo "1. Open the GUI (bun run dev:gui)"
echo "2. You should see the worktree header with:"
echo "   - Current worktree display (or 'Select worktree')"
echo "   - Quick switch buttons for other worktrees"
echo "   - 'Create Worktree' button on the right"
echo ""
echo "3. Test worktree selection:"
echo "   - Click on different worktree buttons"
echo "   - Verify the header updates to show current worktree"
echo "   - Check that the sidebar shows 🌿 branch name under active conversation"
echo ""
echo "4. Test worktree creation dialog:"
echo "   - Click 'Create Worktree' button"
echo "   - Enter a branch name (e.g., 'feature/my-test')"
echo "   - Verify success notification appears"
echo "   - Check that new worktree appears in the selection list"
echo ""
echo "5. Test error handling:"
echo "   - Try creating a worktree with existing branch name"
echo "   - Verify error message appears in the dialog"
echo ""
echo "6. Test worktree context in messages:"
echo "   - Select a worktree"
echo "   - Send a message"
echo "   - The Wake process should run in that worktree's directory"
echo ""

echo "Press Enter when ready to clean up test worktrees..."
read

echo ""
echo "Cleaning up test worktrees..."
for branch in "feature/test-1" "feature/test-2" "bugfix/test-3"; do
  git worktree remove "packages/server/worktrees/${branch}" 2>/dev/null && echo "Removed worktree: ${branch}"
done

echo "Done!"