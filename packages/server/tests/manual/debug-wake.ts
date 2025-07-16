#!/usr/bin/env bun

/**
 * Debug script for Wake process flow
 */

import createApp from '../../src/api/routes';
import { serve } from 'bun';
import { setTimeout } from 'timers/promises';

async function main() {
  console.log('[DEBUG] Starting server...');
  
  // Initialize app
  const app = await createApp;
  
  // Start server
  const server = serve({
    port: 0,
    fetch: app.fetch,
  });
  
  const port = server.port;
  const baseUrl = `http://localhost:${port}`;
  
  // Set PORT for Wake processes
  process.env.PORT = String(port);
  
  console.log(`[DEBUG] Server started on port ${port}`);
  
  try {
    // 1. Send initial message
    console.log('\n[DEBUG] 1. Sending message...');
    const response = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello world' })
    });
    
    const result = await response.json();
    console.log('[DEBUG] Response:', result);
    
    const interactionId = result.id;
    
    // 2. Poll for response
    console.log('\n[DEBUG] 2. Polling for Wake response...');
    let attempts = 0;
    
    while (attempts < 20) {
      const getResponse = await fetch(`${baseUrl}/interactions/${interactionId}`);
      const conversation = await getResponse.json();
      
      console.log(`[DEBUG] Attempt ${attempts + 1}:`);
      console.log(`  - Messages: ${conversation.messages?.length || 0}`);
      console.log(`  - Last message:`, conversation.messages?.slice(-1)[0]);
      
      if (conversation.messages?.length >= 2) {
        console.log('\n[DEBUG] Success! Wake responded.');
        break;
      }
      
      await setTimeout(500);
      attempts++;
    }
    
  } finally {
    console.log('\n[DEBUG] Shutting down...');
    server.stop();
    
    const services = (app as any).services;
    if (services?.wakeProcessor) {
      await services.wakeProcessor.stop();
    }
  }
}

main().catch(console.error);