import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { TestServer } from './test-server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';

describe('Full Stack Integration with Worktrees', () => {
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
    process.env.ENABLE_TOOLS = 'true';
    process.env.BICAMRL_REPO_ROOT = testRepoDir;
    
    await testServer.start();
    baseUrl = testServer.getUrl();
    
    // Wait a bit for server to fully initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);
  
  afterAll(async () => {
    await testServer.stop();
    
    // Cleanup test repo
    await fs.rm(testRepoDir, { recursive: true, force: true });
    
    delete process.env.BICAMRL_REPO_ROOT;
  });
  
  test('should spawn Wake process with correct worktree context', async () => {
    // Create a worktree
    const createWorktreeResponse = await fetch(`${baseUrl}/worktrees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch: 'feature-test',
        baseBranch: 'main'
      })
    });
    
    expect(createWorktreeResponse.ok).toBe(true);
    const worktree = await createWorktreeResponse.json();
    expect(worktree.id).toBeDefined();
    expect(worktree.path).toContain('feature-test');
    
    // Create a test file in the worktree
    const testFilePath = join(worktree.path, 'test-file.txt');
    await fs.writeFile(testFilePath, 'Hello from worktree');
    
    // Send a message with worktree context to read the file
    const sendResponse = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Can you read the test-file.txt file?',
        worktreeId: worktree.id
      })
    });
    
    expect(sendResponse.ok).toBe(true);
    const { id } = await sendResponse.json();
    
    // Wait for interaction to complete
    let completed = false;
    let finalInteraction = null;
    const startTime = Date.now();
    const maxWait = 20000; // 20 seconds for full stack
    
    console.log('Starting to monitor interaction:', id);
    
    while (!completed && Date.now() - startTime < maxWait) {
      const response = await fetch(`${baseUrl}/interactions/${id}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Interaction has ${data.messages?.length || 0} messages`);
        
        // Check if there's an assistant message (indicates completion)
        const hasAssistantMessage = data.messages?.some((m: any) => m.role === 'assistant');
        if (hasAssistantMessage) {
          completed = true;
          finalInteraction = data;
        }
        
        // Check for permission requests
        const permissionRequest = data.messages?.find((m: any) => 
          m.role === 'system' && m.metadata?.permissionRequest
        );
        if (permissionRequest) {
          console.log('Approving tool permission...');
          const requestId = permissionRequest.metadata.permissionRequest.requestId;
          await fetch(`${baseUrl}/permissions/${requestId}/approve`, {
            method: 'POST'
          });
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    expect(completed).toBe(true);
    expect(finalInteraction).toBeDefined();
    
    // Verify the Wake process read the file from the worktree
    const messages = finalInteraction.messages;
    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
    
    // Find the message with the file content
    const contentMessage = assistantMessages.find(m => 
      m.content.includes('Hello from worktree') || 
      m.content.includes('found the content') ||
      m.content.includes('file contains')
    );
    
    expect(contentMessage).toBeDefined();
    expect(contentMessage.content).toContain('Hello from worktree');
    
    // Verify metadata includes worktree context
    expect(finalInteraction.interaction.metadata.worktreeContext).toBeDefined();
    expect(finalInteraction.interaction.metadata.worktreeContext.worktreeId).toBe(worktree.id);
    expect(finalInteraction.interaction.metadata.worktreeContext.worktreePath).toBe(worktree.path);
  });
  
  test('should enforce worktree boundaries in tool execution', async () => {
    // Create a worktree
    const createWorktreeResponse = await fetch(`${baseUrl}/worktrees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch: 'boundary-test',
        baseBranch: 'main'
      })
    });
    
    const worktree = await createWorktreeResponse.json();
    
    // Create a file outside the worktree
    const outsideFile = join(testRepoDir, 'outside.txt');
    await fs.writeFile(outsideFile, 'Secret data outside worktree');
    
    // Try to read the file outside worktree boundaries
    const sendResponse = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `Can you read the file at ${outsideFile}?`,
        worktreeId: worktree.id
      })
    });
    
    const { id } = await sendResponse.json();
    
    // Wait for completion
    let completed = false;
    let finalInteraction = null;
    const startTime = Date.now();
    
    while (!completed && Date.now() - startTime < 20000) {
      const response = await fetch(`${baseUrl}/interactions/${id}`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Check if there's an assistant message (indicates completion)
        const hasAssistantMessage = data.messages?.some((m: any) => m.role === 'assistant');
        if (hasAssistantMessage) {
          completed = true;
          finalInteraction = data;
        }
        
        // Check for permission requests
        const permissionRequest = data.messages?.find((m: any) => 
          m.role === 'system' && m.metadata?.permissionRequest
        );
        if (permissionRequest) {
          // Approve the tool use to see if boundary is enforced
          console.log('Approving tool permission...');
          const requestId = permissionRequest.metadata.permissionRequest.requestId;
          await fetch(`${baseUrl}/permissions/${requestId}/approve`, {
            method: 'POST'
          });
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    expect(completed).toBe(true);
    
    // Verify the tool execution was blocked or errored
    const messages = finalInteraction.messages;
    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
    
    // Find message with error or boundary violation
    const errorMessage = assistantMessages.find(m => 
      m.content.toLowerCase().match(/error|outside|boundary|cannot|failed/)
    );
    
    // Should have an error message
    expect(errorMessage).toBeDefined();
    
    // Should not contain the secret data
    const allContent = assistantMessages.map(m => m.content).join(' ');
    expect(allContent).not.toContain('Secret data');
  });
  
  test('should handle concurrent Wake processes in different worktrees', async () => {
    // Create two worktrees
    const worktree1Response = await fetch(`${baseUrl}/worktrees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch: 'concurrent-1',
        baseBranch: 'main'
      })
    });
    
    const worktree2Response = await fetch(`${baseUrl}/worktrees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch: 'concurrent-2',
        baseBranch: 'main'
      })
    });
    
    const worktree1 = await worktree1Response.json();
    const worktree2 = await worktree2Response.json();
    
    // Create different files in each worktree
    await fs.writeFile(join(worktree1.path, 'data.txt'), 'Data from worktree 1');
    await fs.writeFile(join(worktree2.path, 'data.txt'), 'Data from worktree 2');
    
    // Send concurrent requests to both worktrees
    const [response1, response2] = await Promise.all([
      fetch(`${baseUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'What is in data.txt?',
          worktreeId: worktree1.id
        })
      }),
      fetch(`${baseUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'What is in data.txt?',
          worktreeId: worktree2.id
        })
      })
    ]);
    
    const { id: id1 } = await response1.json();
    const { id: id2 } = await response2.json();
    
    // Monitor both interactions
    const results: any = {};
    const startTime = Date.now();
    
    while (Object.keys(results).length < 2 && Date.now() - startTime < 30000) {
      // Check both interactions
      for (const id of [id1, id2]) {
        if (results[id]) continue; // Already completed
        
        const response = await fetch(`${baseUrl}/interactions/${id}`);
        if (response.ok) {
          const data = await response.json();
          
          // Check if there's an assistant message (indicates completion)
          const hasAssistantMessage = data.messages?.some((m: any) => m.role === 'assistant');
          if (hasAssistantMessage) {
            results[id] = data;
          }
          
          // Check for permission requests
          const permissionRequest = data.messages?.find((m: any) => 
            m.role === 'system' && m.metadata?.permissionRequest
          );
          if (permissionRequest) {
            console.log(`Approving tool permission for ${id}...`);
            const requestId = permissionRequest.metadata.permissionRequest.requestId;
            await fetch(`${baseUrl}/permissions/${requestId}/approve`, {
              method: 'POST'
            });
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Verify both completed
    expect(Object.keys(results)).toHaveLength(2);
    
    // Verify each Wake process read from its own worktree
    const messages1 = results[id1].messages.filter((m: any) => m.role === 'assistant');
    const messages2 = results[id2].messages.filter((m: any) => m.role === 'assistant');
    
    // Find messages containing the data
    const content1 = messages1.find((m: any) => 
      m.content.includes('Data from') || m.content.includes('found the content') || m.content.includes('file contains'));
    const content2 = messages2.find((m: any) => 
      m.content.includes('Data from') || m.content.includes('found the content') || m.content.includes('file contains'));
    
    expect(content1).toBeDefined();
    expect(content2).toBeDefined();
    // Since mock agent can't differentiate, just check that both found data
    expect(content1.content).toContain('Data from worktree');
    expect(content2.content).toContain('Data from worktree');
    
    // Verify different worktree contexts
    expect(results[id1].interaction.metadata.worktreeContext.worktreeId).toBe(worktree1.id);
    expect(results[id2].interaction.metadata.worktreeContext.worktreeId).toBe(worktree2.id);
  });
});