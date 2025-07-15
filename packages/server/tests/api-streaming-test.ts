// Test streaming updates through the API
import { describe, test, expect } from 'bun:test';

describe('API Streaming Updates', () => {
  test('should receive progress updates during processing', async () => {
    const updates: any[] = [];
    
    // Send a message
    const sendResponse = await fetch('http://localhost:3456/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Tell me a very short joke'
      })
    });
    
    const sendResult = await sendResponse.json() as { id: string };
    const interactionId = sendResult.id;
    console.log('Interaction ID:', interactionId);
    
    // Poll for updates
    const startTime = Date.now();
    const maxDuration = 30000; // 30 seconds max
    
    while (Date.now() - startTime < maxDuration) {
      const response = await fetch('http://localhost:3456/interactions');
      const interactions = await response.json();
      
      const interaction = interactions.find((i: any) => i.id === interactionId);
      if (interaction) {
        console.log('Status:', interaction.status);
        console.log('Metadata:', interaction.metadata);
        
        if (interaction.metadata?.currentAction) {
          updates.push({
            time: Date.now() - startTime,
            action: interaction.metadata.currentAction,
            tokens: interaction.metadata.tokens
          });
        }
        
        if (interaction.status === 'completed') {
          console.log('Response received:', interaction.content[interaction.content.length - 1]?.content);
          break;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\nProgress updates:');
    updates.forEach(u => {
      console.log(`  ${u.time}ms: ${u.action} - tokens:`, u.tokens);
    });
    
    // Verify we got some progress updates
    expect(updates.length).toBeGreaterThan(0);
    
    // Verify we saw different actions
    const actions = [...new Set(updates.map(u => u.action))];
    console.log('Unique actions:', actions);
    expect(actions.length).toBeGreaterThan(1);
  });
});