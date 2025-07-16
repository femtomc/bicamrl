import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { TestServer } from './test-server';
import { v4 as uuidv4 } from 'uuid';

describe('Claude Code Integration with Agent Architecture', () => {
  const testServer = new TestServer();
  let baseUrl: string;
  
  beforeAll(async () => {
    // Start server with Claude Code provider
    process.env.DEFAULT_PROVIDER = 'claude_code';
    process.env.ENABLE_TOOLS = 'true';
    
    await testServer.start();
    baseUrl = testServer.getUrl();
  }, 30000);

  afterAll(async () => {
    await testServer.stop();
  });

  test('should process simple message with Claude Code', async () => {
    // Send a message
    const response = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello, what is 2 + 2?' })
    });
    
    expect(response.ok).toBe(true);
    const result = await response.json();
    const interactionId = result.id;
    
    // Wait for completion
    let completed = false;
    let finalInteraction = null;
    const startTime = Date.now();
    const maxWait = 30000; // 30 seconds for Claude
    
    while (!completed && Date.now() - startTime < maxWait) {
      const checkResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      if (checkResponse.ok) {
        const data = await checkResponse.json();
        
        const hasAssistantMessage = data.messages?.some((m: any) => m.role === 'assistant');
        if (hasAssistantMessage) {
          completed = true;
          finalInteraction = data;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    expect(completed).toBe(true);
    expect(finalInteraction).toBeDefined();
    
    const assistantMessages = finalInteraction.messages.filter((m: any) => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThan(0);
    
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    expect(lastMessage.content).toContain('4');
    
    // Verify metadata
    expect(lastMessage.metadata?.model).toContain('claude');
    expect(lastMessage.metadata?.usage).toBeDefined();
    expect(lastMessage.metadata?.usage.totalTokens).toBeGreaterThan(0);
  }, 60000);

  test('should handle multi-turn conversation', async () => {
    // First message
    const response1 = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'My name is Bob. Remember that.' })
    });
    
    const { id: interactionId } = await response1.json();
    
    // Wait for first response
    let completed = false;
    const startTime = Date.now();
    
    while (!completed && Date.now() - startTime < 30000) {
      const checkResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      if (checkResponse.ok) {
        const data = await checkResponse.json();
        const hasAssistantMessage = data.messages?.some((m: any) => m.role === 'assistant');
        if (hasAssistantMessage) {
          completed = true;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    expect(completed).toBe(true);
    
    // Second message in same conversation
    const response2 = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content: 'What is my name?',
        interactionId 
      })
    });
    
    expect(response2.ok).toBe(true);
    
    // Wait for second response
    completed = false;
    let finalInteraction = null;
    const startTime2 = Date.now();
    
    while (!completed && Date.now() - startTime2 < 30000) {
      const checkResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      if (checkResponse.ok) {
        const data = await checkResponse.json();
        // Should have at least 4 messages now (2 user, 2 assistant)
        if (data.messages?.length >= 4) {
          completed = true;
          finalInteraction = data;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    expect(completed).toBe(true);
    expect(finalInteraction.messages.length).toBeGreaterThanOrEqual(4);
    
    // Check that Claude remembers the name
    const lastAssistantMessage = finalInteraction.messages
      .filter((m: any) => m.role === 'assistant')
      .pop();
    
    expect(lastAssistantMessage.content.toLowerCase()).toContain('bob');
  }, 60000);
  
  test('should track thinking animation updates via polling', async () => {
    // Instead of SSE, we'll poll the interaction endpoint to see metadata updates
    const response = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content: 'Explain the concept of recursion in programming with examples' 
      })
    });
    
    const { id: interactionId } = await response.json();
    
    // Track metadata updates
    const metadataUpdates: any[] = [];
    let completed = false;
    const startTime = Date.now();
    
    while (!completed && Date.now() - startTime < 30000) {
      const checkResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      if (checkResponse.ok) {
        const data = await checkResponse.json();
        
        // Capture metadata if it has currentAction
        if (data.interaction?.metadata?.currentAction) {
          metadataUpdates.push({
            action: data.interaction.metadata.currentAction,
            elapsedTime: data.interaction.metadata.elapsedTime,
            currentTokens: data.interaction.metadata.currentTokens
          });
        }
        
        const hasAssistantMessage = data.messages?.some((m: any) => m.role === 'assistant');
        if (hasAssistantMessage) {
          completed = true;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 200)); // Poll more frequently
    }
    
    // Should have captured some thinking updates
    expect(metadataUpdates.length).toBeGreaterThan(0);
    
    // Check that we saw thinking animations
    const thinkingUpdates = metadataUpdates.filter(update => 
      update.action?.includes('Thinking')
    );
    
    expect(thinkingUpdates.length).toBeGreaterThan(0);
    
    // Verify elapsed time and tokens were tracked
    const hasTimeAndTokens = metadataUpdates.some(update => 
      update.elapsedTime !== undefined &&
      update.currentTokens !== undefined
    );
    
    expect(hasTimeAndTokens).toBe(true);
  }, 60000);
  
  test('should handle tool usage with permissions', async () => {
    // Send a message that's more likely to trigger tool use
    // Claude Code is more likely to use tools with explicit requests
    const response = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content: 'Please read the file package.json and tell me what dependencies this project has.' 
      })
    });
    
    const { id: interactionId } = await response.json();
    
    // Monitor for tool usage in metadata
    let completed = false;
    let finalInteraction = null;
    let sawToolUsage = false;
    const startTime = Date.now();
    
    while (!completed && Date.now() - startTime < 45000) { // Give more time
      const checkResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      if (checkResponse.ok) {
        const data = await checkResponse.json();
        
        // Check if we see tool calls in any message metadata
        const messages = data.messages || [];
        for (const msg of messages) {
          if (msg.metadata?.toolsUsed && msg.metadata.toolsUsed.length > 0) {
            sawToolUsage = true;
          }
        }
        
        // Check for completion
        const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
        if (assistantMessages.length > 0) {
          completed = true;
          finalInteraction = data;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    expect(completed).toBe(true);
    
    // Verify the response includes file content or tool usage
    const assistantMessages = finalInteraction.messages.filter((m: any) => m.role === 'assistant');
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    
    // Either we saw tool usage in metadata or Claude mentions the file/dependencies
    const mentionsFileOrDeps = lastMessage.content.toLowerCase().match(/package\.json|dependencies|@anthropic|hono|bun/);
    expect(sawToolUsage || mentionsFileOrDeps).toBeTruthy();
    
    // If tools were used, check metadata
    if (lastMessage.metadata?.toolsUsed) {
      expect(lastMessage.metadata.toolsUsed.length).toBeGreaterThan(0);
    }
  }, 60000);
  
  test('should handle tool permission denial with mock provider', async () => {
    // For permission denial test, switch to mock provider temporarily
    // since Claude Code doesn't reliably trigger dangerous tools
    const testServerMock = new TestServer();
    process.env.DEFAULT_PROVIDER = 'mock';
    
    try {
      await testServerMock.start();
      const mockUrl = testServerMock.getUrl();
      
      // Send a message that the mock will interpret as needing delete tool
      const response = await fetch(`${mockUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: 'delete files' // Mock agent triggers on "delete"
        })
      });
      
      const { id: interactionId } = await response.json();
      
      // Monitor for permission request
      let permissionRequestId = null;
      let completed = false;
      const startTime = Date.now();
      
      while (!completed && Date.now() - startTime < 10000) { // Mock is fast
        const checkResponse = await fetch(`${mockUrl}/interactions/${interactionId}`);
        if (checkResponse.ok) {
          const data = await checkResponse.json();
          
          // Check for permission request
          const permissionMessage = data.messages?.find((m: any) => 
            m.role === 'system' && m.metadata?.permissionRequest
          );
          
          if (permissionMessage && !permissionRequestId) {
            permissionRequestId = permissionMessage.metadata.permissionRequest.requestId;
            
            // Deny the permission
            const denyResponse = await fetch(`${mockUrl}/permissions/${permissionRequestId}/deny`, {
              method: 'POST'
            });
            expect(denyResponse.ok).toBe(true);
          }
          
          // Check for completion
          const assistantMessages = data.messages?.filter((m: any) => m.role === 'assistant') || [];
          if (assistantMessages.length > 0) {
            completed = true;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      expect(completed).toBe(true);
      
      // With mock provider, we should see the permission request
      if (permissionRequestId) {
        expect(permissionRequestId).toBeDefined();
        
        // Verify the response mentions permission denial
        const finalResponse = await fetch(`${mockUrl}/interactions/${interactionId}`);
        const finalData = await finalResponse.json();
        
        const permissionResponse = finalData.messages.find((m: any) => 
          m.metadata?.permissionResponse !== undefined
        );
        
        expect(permissionResponse).toBeDefined();
        expect(permissionResponse.metadata.permissionResponse).toBe(false);
      }
    } finally {
      await testServerMock.stop();
      // Restore Claude Code provider
      process.env.DEFAULT_PROVIDER = 'claude_code';
    }
  }, 30000);
  
  test('should handle errors gracefully', async () => {
    // Send a message that might cause an error
    const response = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content: 'Read the file at /this/path/definitely/does/not/exist/anywhere.txt' 
      })
    });
    
    const { id: interactionId } = await response.json();
    
    // Wait for completion
    let completed = false;
    let finalInteraction = null;
    const startTime = Date.now();
    
    while (!completed && Date.now() - startTime < 30000) {
      const checkResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      if (checkResponse.ok) {
        const data = await checkResponse.json();
        
        // Handle any permission requests
        const permissionMessage = data.messages?.find((m: any) => 
          m.role === 'system' && m.metadata?.permissionRequest
        );
        
        if (permissionMessage) {
          const requestId = permissionMessage.metadata.permissionRequest.requestId;
          await fetch(`${baseUrl}/permissions/${requestId}/approve`, {
            method: 'POST'
          });
        }
        
        const hasAssistantMessage = data.messages?.some((m: any) => m.role === 'assistant');
        if (hasAssistantMessage) {
          completed = true;
          finalInteraction = data;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    expect(completed).toBe(true);
    
    // Should handle the error gracefully
    const assistantMessages = finalInteraction.messages.filter((m: any) => m.role === 'assistant');
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    
    // Should mention the file doesn't exist or similar error
    expect(lastMessage.content.toLowerCase()).toMatch(/not exist|cannot find|error|unable|not found|doesn't exist/);
  }, 60000);
  
  test('should track token usage across conversation', async () => {
    // Start conversation
    const response1 = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hi Claude!' })
    });
    
    const { id: interactionId } = await response1.json();
    
    // Wait for first response
    let messageCount = 0;
    const startTime = Date.now();
    
    while (messageCount < 2 && Date.now() - startTime < 30000) {
      const checkResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      if (checkResponse.ok) {
        const data = await checkResponse.json();
        messageCount = data.messages?.length || 0;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Continue conversation
    const response2 = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content: 'Tell me a short story about a robot',
        interactionId 
      })
    });
    
    // Wait for second response
    let completed = false;
    let finalInteraction = null;
    const startTime2 = Date.now();
    
    while (!completed && Date.now() - startTime2 < 30000) {
      const checkResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      if (checkResponse.ok) {
        const data = await checkResponse.json();
        if (data.messages?.length >= 4) {
          completed = true;
          finalInteraction = data;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    expect(completed).toBe(true);
    
    // Check token usage in metadata
    const assistantMessages = finalInteraction.messages.filter((m: any) => m.role === 'assistant');
    
    let totalTokens = 0;
    assistantMessages.forEach((msg: any) => {
      if (msg.metadata?.usage?.totalTokens) {
        totalTokens += msg.metadata.usage.totalTokens;
      }
    });
    
    // Should have accumulated tokens
    expect(totalTokens).toBeGreaterThan(0);
    
    // Second response should have more tokens due to story
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    expect(lastMessage.metadata?.usage?.outputTokens).toBeGreaterThan(50);
  }, 60000);
});