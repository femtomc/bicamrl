import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { serve } from 'bun';
import { createApp } from '../../src/api/routes';
import { setTimeout } from 'timers/promises';

describe('Server Wake Flow Integration', () => {
  let server: any;
  let port: number;
  let baseUrl: string;
  
  beforeAll(async () => {
    // Create app and start actual server
    const app = await createApp();
    
    // Start server on random port
    server = serve({
      port: 0, // Random available port
      fetch: app.fetch,
    });
    
    port = server.port;
    baseUrl = `http://localhost:${port}`;
    
    console.log('[TEST] Server started on port:', port);
    
    // Update environment for wake processes
    process.env.PORT = String(port);
    
    // Update the WakeProcessor's server port
    const services = (app as any).services;
    if (services?.wakeProcessor) {
      (services.wakeProcessor as any).serverPort = port;
    }
    
    // Give server time to fully initialize
    await setTimeout(1000);
  });
  
  afterAll(async () => {
    console.log('[TEST] Stopping server...');
    server?.stop();
    await setTimeout(500);
  });
  
  test.skip('Wake process can connect and respond', async () => {
    console.log('\n[TEST] Testing Wake process with real server...');
    
    // 1. Send a message
    const response = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello, what is 2 + 2?' })
    });
    
    expect(response.ok).toBe(true);
    const result = await response.json();
    const interactionId = result.id;
    
    console.log('[TEST] Created interaction:', interactionId);
    
    // 2. Wait for Wake to process
    let interaction: any;
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      const checkResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      interaction = await checkResponse.json();
      
      console.log(`[TEST] Attempt ${attempts + 1}: state=${interaction.state?.kind}, messages=${interaction.content?.length}`);
      
      if (interaction.state?.kind === 'completed' || interaction.state?.kind === 'failed') {
        break;
      }
      
      await setTimeout(1000);
      attempts++;
    }
    
    // 3. Verify results
    console.log('\n[TEST] Final state:', interaction.state);
    console.log('[TEST] Messages:', interaction.content?.map((m: any) => ({
      role: m.role,
      length: m.content.length,
      preview: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : '')
    })));
    
    expect(interaction.state?.kind).toBe('completed');
    expect(interaction.content?.length).toBe(2);
    
    const assistantMessage = interaction.content?.find((m: any) => m.role === 'assistant');
    expect(assistantMessage).toBeDefined();
    expect(assistantMessage.content).toBeTruthy();
    expect(assistantMessage.content.length).toBeGreaterThan(0);
  });
  
  test.skip('Wake shows thinking updates via SSE', async () => {
    // Connect to SSE stream
    const eventSource = new EventSource(`${baseUrl}/stream`);
    const events: any[] = [];
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        events.push(data);
        if (data.data?.interaction?.metadata?.processing?.currentAction) {
          console.log('[TEST] Progress update:', data.data.interaction.metadata.processing.currentAction);
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    };
    
    // Send a message
    const response = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Explain quantum computing in simple terms' })
    });
    
    const result = await response.json();
    const interactionId = result.id;
    
    // Wait for processing
    let completed = false;
    const startTime = Date.now();
    
    while (!completed && Date.now() - startTime < 30000) {
      const checkResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      const interaction = await checkResponse.json();
      
      if (interaction.state?.kind === 'completed' || interaction.state?.kind === 'failed') {
        completed = true;
      }
      
      await setTimeout(500);
    }
    
    eventSource.close();
    
    // Check for thinking events
    const thinkingEvents = events.filter(e => 
      e.type === 'interaction_updated' && 
      e.data?.interactionId === interactionId &&
      e.data?.interaction?.metadata?.processing?.currentAction?.includes('Thinking')
    );
    
    console.log('[TEST] Total events:', events.length);
    console.log('[TEST] Thinking events:', thinkingEvents.length);
    
    // Should have received thinking updates
    expect(thinkingEvents.length).toBeGreaterThan(0);
  });
});