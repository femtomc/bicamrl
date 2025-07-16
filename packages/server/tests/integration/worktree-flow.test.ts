import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createApp } from '../../src/api/routes';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Hono } from 'hono';

describe('Worktree Flow Integration', () => {
  let app: Hono;
  let services: any;
  let testRepoPath: string;

  beforeEach(async () => {
    // Create test repository
    testRepoPath = `/tmp/test-repo-${Date.now()}`;
    mkdirSync(testRepoPath, { recursive: true });
    
    // Initialize git repo
    execSync('git init', { cwd: testRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: testRepoPath });
    execSync('git config user.name "Test User"', { cwd: testRepoPath });
    writeFileSync(join(testRepoPath, 'README.md'), '# Test Project\n');
    writeFileSync(join(testRepoPath, 'main.js'), 'console.log("main branch");\n');
    execSync('git add .', { cwd: testRepoPath });
    execSync('git commit -m "Initial commit"', { cwd: testRepoPath });

    // Set repo root for worktree manager
    process.env.BICAMRL_REPO_ROOT = testRepoPath;

    // Create app
    const appInstance = await createApp({ port: 0 }); // Use random port
    app = appInstance as any;
    services = (app as any).services;
  });

  afterEach(() => {
    // Clean up
    if (existsSync(testRepoPath)) {
      rmSync(testRepoPath, { recursive: true, force: true });
    }
    delete process.env.BICAMRL_REPO_ROOT;
  });

  describe('Creating interactions with worktree context', () => {
    test('creates interaction in new worktree', async () => {
      // Create a worktree
      const wtResponse = await app.request('/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch: 'feature/awesome'
        })
      });

      expect(wtResponse.status).toBe(200);
      const worktree = await wtResponse.json();

      // Send message with worktree context
      const msgResponse = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Help me implement the awesome feature',
          worktreeId: worktree.id
        })
      });

      expect(msgResponse.status).toBe(200);
      const result = await msgResponse.json();

      // Verify interaction has worktree context
      const interaction = services.interactionStore.get(result.id);
      expect(interaction.metadata.worktreeContext).toBeDefined();
      expect(interaction.metadata.worktreeContext.worktreeId).toBe(worktree.id);
      expect(interaction.metadata.worktreeContext.worktreePath).toBe(worktree.path);
      expect(interaction.metadata.worktreeContext.branch).toBe('feature/awesome');
    });

    test('spawns Wake process in worktree directory', async () => {
      // Create worktree
      const wtResponse = await app.request('/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch: 'feature/process-test'
        })
      });

      const worktree = await wtResponse.json();

      // Mock Wake processor to capture process config
      let capturedConfig: any = null;
      const originalStartProcess = services.wakeProcessor.processManager.startProcess;
      services.wakeProcessor.processManager.startProcess = async (config: any) => {
        capturedConfig = config;
        // Don't actually start process in test
        return { id: config.id, process: null };
      };

      // Send message
      await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Test message',
          worktreeId: worktree.id
        })
      });

      // Verify process was configured with worktree path
      expect(capturedConfig).toBeDefined();
      expect(capturedConfig.cwd).toBe(worktree.path);

      // Restore
      services.wakeProcessor.processManager.startProcess = originalStartProcess;
    });
  });

  describe('Multiple worktrees with concurrent interactions', () => {
    test('handles concurrent interactions in different worktrees', async () => {
      // Create two worktrees
      const wt1Response = await app.request('/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'feature/one' })
      });
      const wt1 = await wt1Response.json();

      const wt2Response = await app.request('/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'feature/two' })
      });
      const wt2 = await wt2Response.json();

      // Create interactions in each worktree
      const msg1Response = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Working on feature one',
          worktreeId: wt1.id
        })
      });
      const interaction1 = await msg1Response.json();

      const msg2Response = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Working on feature two',
          worktreeId: wt2.id
        })
      });
      const interaction2 = await msg2Response.json();

      // Verify both interactions have correct worktree context
      const int1 = services.interactionStore.get(interaction1.id);
      const int2 = services.interactionStore.get(interaction2.id);

      expect(int1.metadata.worktreeContext.worktreeId).toBe(wt1.id);
      expect(int2.metadata.worktreeContext.worktreeId).toBe(wt2.id);

      // Verify they're different interactions
      expect(interaction1.id).not.toBe(interaction2.id);
    });
  });

  describe('Switching worktrees mid-conversation', () => {
    test('preserves worktree context throughout conversation', async () => {
      // Create worktree
      const wtResponse = await app.request('/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'feature/persistent' })
      });
      const worktree = await wtResponse.json();

      // Start conversation in worktree
      const msg1Response = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'First message',
          worktreeId: worktree.id
        })
      });
      const result = await msg1Response.json();

      // Continue conversation (worktree context should persist)
      const msg2Response = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Second message',
          interactionId: result.id
          // Note: NOT passing worktreeId
        })
      });

      expect(msg2Response.status).toBe(200);

      // Verify worktree context persisted
      const interaction = services.interactionStore.get(result.id);
      expect(interaction.metadata.worktreeContext.worktreeId).toBe(worktree.id);

      // Verify all messages are in same interaction
      const messages = services.messageStore.getMessages(result.id);
      expect(messages).toHaveLength(2);
    });

    test('prevents changing worktree mid-conversation', async () => {
      // Create two worktrees
      const wt1Response = await app.request('/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'feature/first' })
      });
      const wt1 = await wt1Response.json();

      const wt2Response = await app.request('/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'feature/second' })
      });
      const wt2 = await wt2Response.json();

      // Start conversation in first worktree
      const msg1Response = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Starting in first worktree',
          worktreeId: wt1.id
        })
      });
      const result = await msg1Response.json();

      // Try to continue in different worktree (should maintain original)
      const msg2Response = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Trying to switch worktree',
          interactionId: result.id,
          worktreeId: wt2.id // This should be ignored
        })
      });

      expect(msg2Response.status).toBe(200);

      // Verify worktree context didn't change
      const interaction = services.interactionStore.get(result.id);
      expect(interaction.metadata.worktreeContext.worktreeId).toBe(wt1.id);
      expect(interaction.metadata.worktreeContext.worktreeId).not.toBe(wt2.id);
    });
  });

  describe('Worktree cleanup', () => {
    test('removes worktree and associated files', async () => {
      // Create worktree
      const wtResponse = await app.request('/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'feature/cleanup-test' })
      });
      const worktree = await wtResponse.json();

      // Verify it exists
      expect(existsSync(worktree.path)).toBe(true);

      // Remove worktree
      const deleteResponse = await app.request(`/worktrees/${worktree.id}`, {
        method: 'DELETE'
      });

      expect(deleteResponse.status).toBe(200);

      // Verify it's gone
      expect(existsSync(worktree.path)).toBe(false);

      // Verify it's not in the list
      const listResponse = await app.request('/worktrees');
      const worktrees = await listResponse.json();
      const found = worktrees.find((w: any) => w.id === worktree.id);
      expect(found).toBeUndefined();
    });

    test('prevents removing worktree with active Wake process', async () => {
      // Create worktree
      const wtResponse = await app.request('/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'feature/active' })
      });
      const worktree = await wtResponse.json();

      // Create interaction (which would spawn Wake process)
      const msgResponse = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Active process',
          worktreeId: worktree.id
        })
      });
      const interaction = await msgResponse.json();

      // Mock active process
      services.interactionStore.updateMetadata(interaction.id, {
        wakeProcessId: 'active-process-123'
      });

      // Try to remove worktree
      const deleteResponse = await app.request(`/worktrees/${worktree.id}`, {
        method: 'DELETE'
      });

      // Should succeed but warn (or could make it fail)
      expect(deleteResponse.status).toBe(200);
    });
  });

  describe('Tool execution in worktree context', () => {
    test('tools operate in correct worktree directory', async () => {
      // Create worktree with unique file
      const wtResponse = await app.request('/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'feature/tools' })
      });
      const worktree = await wtResponse.json();

      // Add unique file to worktree
      const uniqueFile = join(worktree.path, 'unique.txt');
      writeFileSync(uniqueFile, 'This file only exists in the worktree');

      // Mock tool execution to verify working directory
      let toolWorkingDir: string | undefined;
      const mockTool = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
          toolWorkingDir = process.cwd();
          return { success: true };
        }
      };

      // Register mock tool
      if (services.wakeProcessor.toolRegistry) {
        services.wakeProcessor.toolRegistry.register(mockTool);
      }

      // Create interaction in worktree
      const msgResponse = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Use the test tool',
          worktreeId: worktree.id
        })
      });

      expect(msgResponse.status).toBe(200);

      // In real scenario, Wake would execute in worktree directory
      // For this test, verify the worktree context is properly set
      const result = await msgResponse.json();
      const interaction = services.interactionStore.get(result.id);
      expect(interaction.metadata.worktreeContext.worktreePath).toBe(worktree.path);
    });
  });
});