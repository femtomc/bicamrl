import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { serve } from 'bun';
import { createApp } from '../../src/api/routes';
import type { Hono } from 'hono';
import { setTimeout } from 'timers/promises';

describe('Full Wake Flow Integration', () => {
  let app: Hono;
  let server: any;
  let baseUrl: string;
  let interactionStore: any;
  let messageStore: any;
  let wakeProcessor: any;
  let eventLog: any[] = [];
  
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
    messageStore = services?.messageStore;
    wakeProcessor = services?.wakeProcessor;
    
    // Subscribe to all events
    if (interactionStore) {
      interactionStore.on('event', (event: any) => {
        eventLog.push({
          timestamp: new Date(),
          ...event
        });
        console.log('[TEST EVENT]', event.type, {
          interactionId: event.data?.interaction?.id
        });
      });
    }
    
    if (messageStore) {
      messageStore.on('event', (event: any) => {
        eventLog.push({
          timestamp: new Date(),
          ...event
        });
        console.log('[TEST EVENT]', event.type, {
          messageId: event.data?.message?.id,
          interactionId: event.data?.interactionId,
          role: event.data?.message?.role
        });
      });
    }
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
  
  test('Complete wake flow with response', async () => {
    eventLog = [];
    
    // 1. Send a message (simulating GUI action)
    console.log('\n[TEST] 1. Sending message...');
    const sendResponse = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello, what is 2 + 2?' })
    });
    
    expect(sendResponse.status).toBe(200);
    const sendResult = await sendResponse.json();
    const interactionId = sendResult.id;
    
    console.log('[TEST] Created interaction:', interactionId);
    
    // 2. Wait for processing with timeout
    console.log('\n[TEST] 2. Waiting for Wake to process...');
    const startTime = Date.now();
    const timeout = 30000; // 30 seconds
    let finalInteraction: any;
    
    while (Date.now() - startTime < timeout) {
      const getResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      const conversation = await getResponse.json();
      
      console.log('[TEST] Current state:', {
        interactionId: conversation.interaction?.id,
        messageCount: conversation.messages?.length,
        lastMessage: conversation.messages?.[conversation.messages.length - 1]
      });
      
      // Check if we have an assistant response
      const assistantMessages = conversation.messages?.filter((m: any) => m.role === 'assistant') || [];
      if (assistantMessages.length > 0) {
        finalInteraction = conversation;
        break;
      }
      
      await setTimeout(1000);
    }
    
    // 3. Verify the response
    console.log('\n[TEST] 3. Final conversation:');
    console.log('Interaction:', finalInteraction.interaction);
    console.log('Messages:', finalInteraction.messages?.map((m: any) => ({
      role: m.role,
      contentLength: m.content.length,
      preview: m.content.substring(0, 100)
    })));
    
    expect(finalInteraction.messages?.length).toBeGreaterThanOrEqual(2);
    const assistantMessage = finalInteraction.messages?.find((m: any) => m.role === 'assistant');
    expect(assistantMessage).toBeDefined();
    expect(assistantMessage?.content).toContain('4');
    
    // 4. Verify events were fired
    console.log('\n[TEST] 4. Events fired:', eventLog.map(e => e.type));
    
    const interactionCreatedEvent = eventLog.find(e => e.type === 'interaction:created');
    const messageAddedEvents = eventLog.filter(e => e.type === 'message:added');
    
    expect(interactionCreatedEvent).toBeDefined();
    expect(messageAddedEvents.length).toBeGreaterThanOrEqual(2); // User message + assistant response
  });
});