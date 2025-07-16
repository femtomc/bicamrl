import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { serve } from 'bun';
import { createApp } from '../../src/api/routes';
import type { Hono } from 'hono';
import { setTimeout } from 'timers/promises';

describe('Multi-Message Conversation Flow', () => {
  let app: Hono;
  let server: any;
  let baseUrl: string;
  let interactionStore: any;
  let wakeProcessor: any;
  
  beforeAll(async () => {
    // Initialize the app with all services
    app = await createApp();
    
    // Start actual server on random port
    server = serve({
      port: 0, // Random available port
      fetch: app.fetch,
    });
    
    const port = server.port;
    baseUrl = `http://localhost:${port}`;
    
    // Set the PORT env var so Wake processes know where to connect
    process.env.PORT = String(port);
    
    console.log(`[TEST] Server started on port: ${port}`);
    
    // Get references to services for inspection
    const services = (app as any).services;
    
    // Update the WakeProcessor's server port
    if (services?.wakeProcessor) {
      (services.wakeProcessor as any).serverPort = port;
    }
    interactionStore = services?.interactionStore;
    wakeProcessor = services?.wakeProcessor;
    
    console.log('[TEST] Services attached:', {
      hasInteractionStore: !!interactionStore,
      hasWakeProcessor: !!wakeProcessor
    });
  });
  
  afterAll(async () => {
    // Clean shutdown
    console.log('[TEST] Stopping server...');
    server?.stop();
    
    if (wakeProcessor?.stop) {
      await wakeProcessor.stop();
    }
    
    // Clean up env var
    delete process.env.PORT;
  });
  
  test('Wake maintains conversation context across multiple messages', async () => {
    // 1. Start a conversation
    console.log('\n[TEST] 1. Starting conversation...');
    const firstResponse = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello! My name is Alice.' })
    });
    
    expect(firstResponse.status).toBe(200);
    const firstResult = await firstResponse.json();
    const interactionId = firstResult.id;
    
    console.log('[TEST] Created interaction:', interactionId);
    
    // 2. Wait for first response
    console.log('\n[TEST] 2. Waiting for first response...');
    let interaction: any;
    let attempts = 0;
    
    while (attempts < 30) {
      const getResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      interaction = await getResponse.json();
      
      console.log(`[TEST] Attempt ${attempts + 1}: messages=${interaction.messages?.length}`);
      
      // Wait for Wake's response (2 messages: user + assistant)
      if (interaction.messages?.length >= 2) {
        break;
      }
      
      await setTimeout(500);
      attempts++;
    }
    
    expect(interaction.messages?.length).toBeGreaterThanOrEqual(2);
    const assistantMsg = interaction.messages?.find((m: any) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    console.log('[TEST] First response:', assistantMsg?.content);
    
    // 3. Send a follow-up message
    console.log('\n[TEST] 3. Sending follow-up message...');
    const secondResponse = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content: 'What is my name?',
        interactionId // Important: send to same interaction
      })
    });
    
    expect(secondResponse.status).toBe(200);
    
    // 4. Wait for second response
    console.log('\n[TEST] 4. Waiting for second response...');
    attempts = 0;
    
    while (attempts < 30) {
      const getResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      interaction = await getResponse.json();
      
      console.log(`[TEST] Attempt ${attempts + 1}: messages=${interaction.messages?.length}`);
      
      // Wait for second Wake response (4 messages total)
      if (interaction.messages?.length >= 4) {
        break;
      }
      
      await setTimeout(500);
      attempts++;
    }
    
    expect(interaction.messages?.length).toBeGreaterThanOrEqual(4);
    const assistantMessages = interaction.messages?.filter((m: any) => m.role === 'assistant');
    expect(assistantMessages?.length).toBeGreaterThanOrEqual(2);
    
    const secondAssistantResponse = assistantMessages?.[1]?.content;
    console.log('[TEST] Second response:', secondAssistantResponse);
    
    // 5. Verify Wake remembers the context
    expect(secondAssistantResponse.toLowerCase()).toContain('alice');
    
    // 6. Send one more message to test continued conversation
    console.log('\n[TEST] 5. Testing continued conversation...');
    const thirdResponse = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content: 'Can you count from 1 to 3?',
        interactionId
      })
    });
    
    expect(thirdResponse.status).toBe(200);
    
    // Wait for third response
    attempts = 0;
    while (attempts < 30) {
      const getResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      interaction = await getResponse.json();
      
      if (interaction.messages?.length >= 6) {
        break;
      }
      
      await setTimeout(500);
      attempts++;
    }
    
    expect(interaction.messages?.length).toBeGreaterThanOrEqual(6);
    const allAssistantMessages = interaction.messages?.filter((m: any) => m.role === 'assistant');
    expect(allAssistantMessages?.length).toBeGreaterThanOrEqual(3);
    
    const thirdAssistantResponse = allAssistantMessages?.[2]?.content;
    console.log('[TEST] Third response:', thirdAssistantResponse);
    
    // Verify the response contains counting (may have newlines or spaces)
    expect(thirdAssistantResponse).toMatch(/1[\s\S]*2[\s\S]*3/);
    
    // Log full conversation
    console.log('\n[TEST] Full conversation:');
    interaction.messages?.forEach((msg: any, i: number) => {
      console.log(`  ${i + 1}. ${msg.role}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
    });
  }, 30000); // 30 second timeout
});