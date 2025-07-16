import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'bun';
import { setTimeout } from 'timers/promises';

describe('Claude Code Integration', () => {
  let serverProcess: any;
  let serverPort: number;
  
  beforeAll(async () => {
    // Start the server
    console.log('[TEST] Starting server...');
    serverProcess = spawn({
      cmd: ['bun', 'run', 'dev:server'],
      cwd: process.cwd(),
      env: { ...process.env, PORT: '0' }, // Use random port
      stdout: 'pipe',
      stderr: 'pipe'
    });
    
    // Wait for server to start and get port
    const portPromise = new Promise<number>(async (resolve) => {
      const decoder = new TextDecoder();
      for await (const chunk of serverProcess.stdout) {
        const text = decoder.decode(chunk);
        console.log('[SERVER]', text.trim());
        const match = text.match(/Server running on http:\/\/localhost:(\d+)/);
        if (match) {
          resolve(parseInt(match[1]));
          break;
        }
      }
    });
    
    serverPort = await portPromise;
    console.log('[TEST] Server started on port:', serverPort);
    
    // Give it a moment to fully initialize
    await setTimeout(2000);
  });
  
  afterAll(async () => {
    console.log('[TEST] Stopping server...');
    serverProcess?.kill();
    await setTimeout(1000);
  });

  test('Wake should respond with Claude Code', async () => {
    console.log('[TEST] Sending message to Wake...');
    
    // Send a message
    const response = await fetch(`http://localhost:${serverPort}/api/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello, what is Bicamrl?' })
    });
    
    expect(response.ok).toBe(true);
    const result = await response.json();
    const interactionId = result.id;
    
    console.log('[TEST] Created interaction:', interactionId);
    
    // Poll for completion
    let interaction: any;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds
    
    while (attempts < maxAttempts) {
      const checkResponse = await fetch(`http://localhost:${serverPort}/api/interactions/${interactionId}`);
      interaction = await checkResponse.json();
      
      console.log('[TEST] Interaction state:', interaction.state?.kind, 'messages:', interaction.content?.length);
      
      if (interaction.state?.kind === 'completed') {
        break;
      }
      
      await setTimeout(1000);
      attempts++;
    }
    
    // Verify response
    expect(interaction.state?.kind).toBe('completed');
    expect(interaction.content?.length).toBeGreaterThan(1);
    
    const assistantMessage = interaction.content?.find((m: any) => m.role === 'assistant');
    expect(assistantMessage).toBeDefined();
    expect(assistantMessage.content).toBeTruthy();
    
    console.log('[TEST] Assistant response preview:', assistantMessage.content.substring(0, 200));
  });

  test('Wake should show thinking animation', async () => {
    // Create SSE connection
    const eventSource = new EventSource(`http://localhost:${serverPort}/api/stream`);
    const events: any[] = [];
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      events.push(data);
    };
    
    // Send a message
    const response = await fetch(`http://localhost:${serverPort}/api/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Tell me about concurrent programming' })
    });
    
    const result = await response.json();
    const interactionId = result.id;
    
    // Wait for completion
    await setTimeout(5000);
    
    eventSource.close();
    
    // Check for thinking updates
    const thinkingUpdates = events.filter(e => 
      e.type === 'interaction_updated' && 
      e.data?.interactionId === interactionId &&
      e.data?.interaction?.metadata?.currentAction?.includes('Thinking')
    );
    
    console.log('[TEST] Thinking updates count:', thinkingUpdates.length);
    expect(thinkingUpdates.length).toBeGreaterThan(0);
  });
});