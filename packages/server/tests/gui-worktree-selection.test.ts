import { test, expect, beforeAll, afterAll } from 'bun:test';
import { serve } from 'bun';
import app from '../src/api/routes';

const PORT = 3468; // Different port for this test
const baseUrl = `http://localhost:${PORT}`;
let server: any;
const testBranches: string[] = [];

beforeAll(async () => {
  // Start server
  server = serve({
    port: PORT,
    fetch: app.fetch
  });
  console.log(`Test server started on port ${PORT}`);
});

afterAll(async () => {
  // Clean up test worktrees via API
  const worktrees = await fetch(`${baseUrl}/worktrees`).then(r => r.json());
  for (const wt of worktrees) {
    if (wt.branch?.includes('test-gui-')) {
      try {
        await fetch(`${baseUrl}/worktrees/${wt.id}`, { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to delete test worktree:', e);
      }
    }
  }
  
  server?.stop();
});

test('GUI worktree selection - list available worktrees', async () => {
  // Create some test worktrees via API
  const wt1Response = await fetch(`${baseUrl}/worktrees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      branch: 'test-gui-feature-1',
      baseBranch: 'main'
    })
  });
  
  const wt2Response = await fetch(`${baseUrl}/worktrees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      branch: 'test-gui-feature-2',
      baseBranch: 'main'
    })
  });
  
  // Get list of worktrees
  const response = await fetch(`${baseUrl}/worktrees`);
  const worktrees = await response.json();
  
  expect(response.status).toBe(200);
  expect(Array.isArray(worktrees)).toBe(true);
  
  // Should include main worktree and our test worktrees
  const branches = worktrees.map((w: any) => w.branch);
  expect(branches).toContain('refs/heads/main');
  expect(branches).toContain('refs/heads/test-gui-feature-1');
  expect(branches).toContain('refs/heads/test-gui-feature-2');
  
  // Each worktree should have required fields
  for (const wt of worktrees) {
    expect(wt).toHaveProperty('id');
    expect(wt).toHaveProperty('path');
    expect(wt).toHaveProperty('branch');
    expect(wt).toHaveProperty('status');
  }
});

test('GUI worktree selection - switch between worktrees', async () => {
  // Get list of worktrees
  const listResponse = await fetch(`${baseUrl}/worktrees`);
  const worktrees = await listResponse.json();
  
  // Find a test worktree
  const testWorktree = worktrees.find((w: any) => 
    w.branch?.includes('test-gui-')
  );
  
  expect(testWorktree).toBeDefined();
  
  // Send a message with the selected worktree
  const messageResponse = await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'Test message in worktree',
      worktree_id: testWorktree.id
    })
  });
  
  expect(messageResponse.status).toBe(200);
  const result = await messageResponse.json();
  expect(result.id).toBeDefined();
  
  // Verify the interaction has the correct worktree context
  const interactionResponse = await fetch(`${baseUrl}/interactions/${result.id}`);
  const interaction = await interactionResponse.json();
  
  expect(interaction.metadata?.worktreeId).toBe(testWorktree.id);
  expect(interaction.metadata?.worktreePath).toBe(testWorktree.path);
});

test('GUI worktree selection - create worktree updates list', async () => {
  // Get initial list
  const initialResponse = await fetch(`${baseUrl}/worktrees`);
  const initialWorktrees = await initialResponse.json();
  const initialCount = initialWorktrees.length;
  
  // Create a new worktree
  const createResponse = await fetch(`${baseUrl}/worktrees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      branch: 'test-gui-new-branch',
      baseBranch: 'main'
    })
  });
  
  expect(createResponse.status).toBe(200);
  const newWorktree = await createResponse.json();
  
  // Get updated list
  const updatedResponse = await fetch(`${baseUrl}/worktrees`);
  const updatedWorktrees = await updatedResponse.json();
  
  expect(updatedWorktrees.length).toBe(initialCount + 1);
  
  // Verify new worktree is in the list
  const found = updatedWorktrees.find((w: any) => w.id === newWorktree.id);
  expect(found).toBeDefined();
  expect(found.branch).toBe('refs/heads/test-gui-new-branch');
});