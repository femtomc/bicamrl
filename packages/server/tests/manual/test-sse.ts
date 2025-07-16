#!/usr/bin/env bun

/**
 * Test SSE stream
 */

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3456';

console.log('Testing SSE stream...');
console.log('Connecting to:', `${SERVER_URL}/stream`);

const response = await fetch(`${SERVER_URL}/stream`, {
  headers: {
    'Accept': 'text/event-stream',
  }
});

if (!response.ok || !response.body) {
  console.error('Failed to connect to SSE stream');
  process.exit(1);
}

console.log('Connected! Listening for events...\n');

const decoder = new TextDecoder();
const reader = response.body.getReader();

try {
  let buffer = '';
  let eventCount = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const text = decoder.decode(value, { stream: true });
    buffer += text;
    
    // Process complete lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        eventCount++;
        const data = line.slice(6);
        try {
          const event = JSON.parse(data);
          console.log(`[Event ${eventCount}] ${event.type}:`, {
            interactionId: event.data?.interactionId,
            timestamp: event.timestamp,
            metadata: event.data?.interaction?.metadata
          });
        } catch (e) {
          console.log(`[Event ${eventCount}] Raw:`, line);
        }
      } else if (line.startsWith(':')) {
        console.log('[Keep-alive]', line);
      }
    }
    
    // Exit after 10 events to avoid running forever
    if (eventCount > 10) {
      console.log('\nReceived 10 events, exiting...');
      break;
    }
  }
} finally {
  reader.releaseLock();
}