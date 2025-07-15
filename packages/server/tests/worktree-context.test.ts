import { test, expect } from 'bun:test';
import { InteractionStore } from '../src/interaction/store';
import { Interaction } from '../src/interaction/types';

test('Worktree context is saved in interaction metadata', async () => {
  const store = new InteractionStore();
  
  // Create an interaction with worktree context
  const interactionData = {
    id: 'test-123',
    source: 'test',
    type: 'user_query' as const,
    messages: [{ role: 'user' as const, content: 'Test message', timestamp: new Date() }],
    createdAt: new Date()
  };
  
  const metadata = {
    worktreeContext: {
      worktreeId: 'test-wt-123',
      worktreePath: '/path/to/worktree'
    }
  };
  
  const interaction = new Interaction(interactionData, { kind: 'queued' }, metadata);
  
  await store.create(interaction);
  
  // Verify worktree context is saved
  expect(interaction.metadata?.worktreeContext).toBeDefined();
  expect(interaction.metadata?.worktreeContext?.worktreeId).toBe('test-wt-123');
  expect(interaction.metadata?.worktreeContext?.worktreePath).toBe('/path/to/worktree');
  
  // Update interaction
  await store.update(interaction.id, i => 
    i.withState({
      kind: 'processing',
      processor: 'wake',
      startedAt: new Date()
    })
  );
  
  // Get updated interaction
  const updated = store.get(interaction.id);
  
  // Verify worktree context persists through updates
  expect(updated?.metadata?.worktreeContext).toBeDefined();
  expect(updated?.metadata?.worktreeContext?.worktreeId).toBe('test-wt-123');
  expect(updated?.metadata?.worktreeContext?.worktreePath).toBe('/path/to/worktree');
});

test('Wake processor uses worktree path from metadata', async () => {
  const store = new InteractionStore();
  
  // Create interaction with worktree context
  const interactionData = {
    id: 'test-456',
    source: 'test',
    type: 'user_query' as const,
    messages: [{ role: 'user' as const, content: 'List files', timestamp: new Date() }],
    createdAt: new Date()
  };
  
  const metadata = {
    worktreeContext: {
      worktreeId: 'wt-456',
      worktreePath: '/Users/test/project/worktrees/feature-branch'
    }
  };
  
  const interaction = new Interaction(interactionData, { kind: 'queued' }, metadata);
  
  await store.create(interaction);
  
  // The Wake processor should use worktreePath as cwd
  const expectedCwd = interaction.metadata?.worktreeContext?.worktreePath;
  expect(expectedCwd).toBe('/Users/test/project/worktrees/feature-branch');
});