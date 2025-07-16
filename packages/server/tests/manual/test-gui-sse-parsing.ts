#!/usr/bin/env bun

/**
 * Test that mimics GUI SSE parsing to debug issues
 */

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3456';

async function testSSEParsing() {
  console.log('Testing SSE parsing like GUI does...\n');
  
  // 1. Create an interaction
  const createResp = await fetch(`${SERVER_URL}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'SSE test' })
  });
  
  const { id, type } = await createResp.json();
  console.log('Created interaction:', { id, type });
  
  // 2. Connect to SSE and parse like GUI does
  console.log('\nConnecting to SSE...');
  const response = await fetch(`${SERVER_URL}/stream`, {
    headers: { 'Accept': 'text/event-stream' }
  });
  
  if (!response.ok || !response.body) {
    console.error('Failed to connect to SSE');
    return;
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventCount = 0;
  
  // Read for 5 seconds
  const timeout = setTimeout(() => {
    console.log('\nTimeout reached, stopping...');
    reader.cancel();
  }, 5000);
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value, { stream: true });
      buffer += text;
      
      // Process complete SSE messages (like GUI does)
      while (buffer.includes('\n\n')) {
        const pos = buffer.indexOf('\n\n');
        const message = buffer.substring(0, pos + 2);
        buffer = buffer.substring(pos + 2);
        
        // Handle keep-alive messages
        if (message.startsWith(':')) {
          console.log('[Keep-alive]', message.trim());
          continue;
        }
        
        // Parse data lines
        if (message.includes('data: ')) {
          const dataLine = message.split('data: ')[1]?.trim();
          if (dataLine) {
            try {
              const json = JSON.parse(dataLine);
              eventCount++;
              console.log(`\n[Event ${eventCount}] ${json.type}:`);
              
              // Check event types GUI expects
              if (['interaction_updated', 'interaction_processing', 'interaction_completed'].includes(json.type)) {
                console.log('  ✓ GUI recognizes this event type');
              } else {
                console.log('  ✗ GUI does NOT recognize this event type');
              }
              
              // Check data structure
              if (json.data?.interactionId === id) {
                console.log('  ✓ Found our interaction!');
                console.log('  Interaction state:', json.data.interaction?.state);
                console.log('  Metadata:', json.data.interaction?.metadata);
              }
            } catch (e) {
              console.log('[Parse error]', e.message);
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Stream error:', e);
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  
  console.log(`\nTotal events received: ${eventCount}`);
}

// First start the server, then run this
console.log('Make sure server is running: bun run dev');
console.log('Starting test in 2 seconds...\n');
setTimeout(() => {
  testSSEParsing().catch(console.error);
}, 2000);