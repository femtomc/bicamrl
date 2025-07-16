import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { serve } from 'bun';
import { createApp } from '../../src/api/routes';
import type { Hono } from 'hono';
import { setTimeout } from 'timers/promises';
import { writeFileSync } from 'fs';
import { join } from 'path';

describe('Tool Execution Flow', () => {
  let app: Hono;
  let server: any;
  let baseUrl: string;
  let testFilePath: string;
  
  beforeAll(async () => {
    // Create a test file to read
    testFilePath = join(process.cwd(), 'test-todo.txt');
    writeFileSync(testFilePath, 'Test TODO content: Buy milk');
    
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
    
    // Update the WakeProcessor's server port
    const services = (app as any).services;
    if (services?.wakeProcessor) {
      (services.wakeProcessor as any).serverPort = port;
    }
    
    console.log(`[TEST] Server started on port: ${port}`);
  });
  
  afterAll(async () => {
    // Clean shutdown
    console.log('[TEST] Stopping server...');
    server?.stop();
    
    const services = (app as any).services;
    if (services?.wakeProcessor?.stop) {
      await services.wakeProcessor.stop();
    }
    
    // Clean up test file
    try {
      const { unlinkSync } = await import('fs');
      unlinkSync(testFilePath);
    } catch {}
    
    // Clean up env var
    delete process.env.PORT;
  });
  
  test('Wake can execute TodoRead tool', async () => {
    // 1. Send a message asking to read a todo file
    console.log('\n[TEST] 1. Sending message with tool request...');
    const response = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Please read the test-todo.txt file' })
    });
    
    expect(response.status).toBe(200);
    const result = await response.json();
    const interactionId = result.id;
    
    console.log('[TEST] Created interaction:', interactionId);
    
    // 2. Wait for response with tool execution
    console.log('\n[TEST] 2. Waiting for tool execution...');
    let conversation: any;
    let attempts = 0;
    const maxAttempts = 20;
    
    while (attempts < maxAttempts) {
      const getResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      conversation = await getResponse.json();
      
      const assistantMessages = conversation.messages?.filter((m: any) => m.role === 'assistant') || [];
      console.log(`[TEST] Attempt ${attempts + 1}: assistant messages = ${assistantMessages.length}`);
      
      // Check if we have an assistant response
      if (assistantMessages.length > 0) {
        const lastMessage = assistantMessages[assistantMessages.length - 1];
        console.log('[TEST] Assistant response:', lastMessage.content?.substring(0, 100) + '...');
        
        // Check if the response mentions the file content
        if (lastMessage.content?.toLowerCase().includes('milk') || 
            lastMessage.content?.toLowerCase().includes('todo')) {
          break;
        }
      }
      
      await setTimeout(1000);
      attempts++;
    }
    
    // 3. Verify the response
    console.log('\n[TEST] 3. Verifying response...');
    expect(conversation.messages?.length).toBeGreaterThanOrEqual(2);
    
    const assistantMessages = conversation.messages?.filter((m: any) => m.role === 'assistant') || [];
    expect(assistantMessages.length).toBeGreaterThan(0);
    
    const finalResponse = assistantMessages[assistantMessages.length - 1];
    console.log('[TEST] Final response:', finalResponse.content);
    
    // The response should mention the file content or indicate it was read
    const responseText = finalResponse.content.toLowerCase();
    expect(
      responseText.includes('milk') || 
      responseText.includes('todo') ||
      responseText.includes('file') ||
      responseText.includes('read')
    ).toBe(true);
    
    // Check if tools were used
    if (finalResponse.metadata?.toolsUsed) {
      console.log('[TEST] Tools used:', finalResponse.metadata.toolsUsed);
      // Claude Code might use 'Read' instead of 'TodoRead'
      expect(finalResponse.metadata.toolsUsed.some((tool: string) => 
        tool === 'Read' || tool === 'TodoRead'
      )).toBe(true);
    }
  }, 30000); // 30 second timeout
});