import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { TestServer } from './test-server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';

describe('Wake Process Worktree Integration', () => {
  const testServer = new TestServer();
  let baseUrl: string;
  let testRepoDir: string;
  
  beforeAll(async () => {
    // Create a test git repo
    testRepoDir = join(tmpdir(), `bicamrl-test-repo-${uuidv4()}`);
    await fs.mkdir(testRepoDir, { recursive: true });
    
    // Initialize git repo
    execSync('git init', { cwd: testRepoDir });
    execSync('git config user.email "test@example.com"', { cwd: testRepoDir });
    execSync('git config user.name "Test User"', { cwd: testRepoDir });
    
    // Create initial commit
    await fs.writeFile(join(testRepoDir, 'README.md'), '# Test Repo\n');
    execSync('git add .', { cwd: testRepoDir });
    execSync('git commit -m "Initial commit"', { cwd: testRepoDir });
    
    // Set test environment
    process.env.DEFAULT_PROVIDER = 'mock';
    process.env.ENABLE_TOOLS = 'false';  // Disable tools for simple test
    process.env.BICAMRL_REPO_ROOT = testRepoDir;
    
    await testServer.start();
    baseUrl = testServer.getUrl();
    
    // Wait a bit for server to fully initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);
  
  afterAll(async () => {
    await testServer.stop();
    await fs.rm(testRepoDir, { recursive: true, force: true });
    delete process.env.BICAMRL_REPO_ROOT;
  });
  
  test('Wake process spawns in correct worktree directory', async () => {
    // Create a worktree
    const createWorktreeResponse = await fetch(`${baseUrl}/worktrees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch: 'test-wake-spawn',
        baseBranch: 'main'
      })
    });
    
    expect(createWorktreeResponse.ok).toBe(true);
    const worktree = await createWorktreeResponse.json();
    
    console.log('Created worktree:', worktree);
    
    // Send a simple message with worktree context
    const sendResponse = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Hello from test',
        worktreeId: worktree.id
      })
    });
    
    expect(sendResponse.ok).toBe(true);
    const { id } = await sendResponse.json();
    
    // Wait for interaction to complete
    let completed = false;
    let finalInteraction = null;
    const startTime = Date.now();
    const maxWait = 10000; // 10 seconds
    
    while (!completed && Date.now() - startTime < maxWait) {
      const response = await fetch(`${baseUrl}/interactions`);
      const interactions = await response.json();
      
      const interaction = interactions.find((i: any) => i.id === id);
      if (interaction && interaction.status === 'completed') {
        completed = true;
        finalInteraction = interaction;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    expect(completed).toBe(true);
    expect(finalInteraction).toBeDefined();
    
    // Verify worktree context was preserved
    expect(finalInteraction.metadata.worktreeContext).toBeDefined();
    expect(finalInteraction.metadata.worktreeContext.worktreeId).toBe(worktree.id);
    expect(finalInteraction.metadata.worktreeContext.worktreePath).toBe(worktree.path);
    
    // Verify we got a response
    const assistantMessages = finalInteraction.content.filter((m: any) => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThan(0);
  });
  
  test('Multiple Wake processes run in different worktrees', async () => {
    // Create two worktrees
    const [worktree1Response, worktree2Response] = await Promise.all([
      fetch(`${baseUrl}/worktrees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'wake-test-1', baseBranch: 'main' })
      }),
      fetch(`${baseUrl}/worktrees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'wake-test-2', baseBranch: 'main' })
      })
    ]);
    
    const worktree1 = await worktree1Response.json();
    const worktree2 = await worktree2Response.json();
    
    // Send messages to both worktrees
    const [response1, response2] = await Promise.all([
      fetch(`${baseUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Process in worktree 1',
          worktreeId: worktree1.id
        })
      }),
      fetch(`${baseUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Process in worktree 2',
          worktreeId: worktree2.id
        })
      })
    ]);
    
    const { id: id1 } = await response1.json();
    const { id: id2 } = await response2.json();
    
    // Wait for both to complete
    const results: any = {};
    const startTime = Date.now();
    
    while (Object.keys(results).length < 2 && Date.now() - startTime < 15000) {
      const response = await fetch(`${baseUrl}/interactions`);
      const interactions = await response.json();
      
      for (const interaction of interactions) {
        if (interaction.id === id1 && interaction.status === 'completed') {
          results[id1] = interaction;
        } else if (interaction.id === id2 && interaction.status === 'completed') {
          results[id2] = interaction;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Verify both completed with correct worktree contexts
    expect(Object.keys(results)).toHaveLength(2);
    expect(results[id1].metadata.worktreeContext.worktreeId).toBe(worktree1.id);
    expect(results[id2].metadata.worktreeContext.worktreeId).toBe(worktree2.id);
  });
});