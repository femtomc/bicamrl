#!/usr/bin/env bun

/**
 * Test multiple server instances running simultaneously
 */

import { createApp } from '../../src/api/routes';
import { serve } from 'bun';
import { setTimeout } from 'timers/promises';

async function startServer(name: string, port: number) {
  console.log(`\n[${name}] Starting server on port ${port}...`);
  
  // Set PORT environment variable
  process.env.PORT = String(port);
  
  // Create app with specific port
  const app = await createApp({ port });
  
  // Start server
  const server = serve({
    port,
    fetch: app.fetch,
  });
  
  console.log(`[${name}] Server started on port ${port}`);
  
  // Send a test message
  const response = await fetch(`http://localhost:${port}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `Hello from ${name}` })
  });
  
  const result = await response.json();
  console.log(`[${name}] Created interaction:`, result.id);
  
  // Wait a bit to see if Wake spawns and processes the message
  await setTimeout(5000);
  
  // Check for response
  const getResponse = await fetch(`http://localhost:${port}/interactions/${result.id}`);
  const interaction = await getResponse.json();
  
  console.log(`[${name}] Messages:`, interaction.messages?.length);
  console.log(`[${name}] Wake process spawned:`, interaction.metadata?.wakeProcessId ? 'YES' : 'NO');
  
  // Check if Wake actually responded
  const assistantMessages = interaction.messages?.filter((m: any) => m.role === 'assistant') || [];
  console.log(`[${name}] Assistant responded:`, assistantMessages.length > 0 ? 'YES' : 'NO');
  if (assistantMessages.length > 0) {
    console.log(`[${name}] Response preview:`, assistantMessages[0].content.substring(0, 50));
  }
  
  // Stop server
  server.stop();
  const services = (app as any).services;
  if (services?.wakeProcessor) {
    await services.wakeProcessor.stop();
  }
  
  console.log(`[${name}] Server stopped`);
}

async function main() {
  try {
    // Test 1: Run servers sequentially
    console.log('=== TEST 1: Sequential servers ===');
    await startServer('Server1', 4001);
    await startServer('Server2', 4002);
    
    // Test 2: Run servers in parallel
    console.log('\n=== TEST 2: Parallel servers ===');
    await Promise.all([
      startServer('Server3', 4003),
      startServer('Server4', 4004)
    ]);
    
    console.log('\n=== All tests completed ===');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

main();