import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { TestServer } from './test-server';

describe('API Real-time Updates', () => {
  const testServer = new TestServer();
  let baseUrl: string;
  
  beforeAll(async () => {
    await testServer.start();
    baseUrl = testServer.getUrl();
  }, 10000); // Increase timeout for server startup
  
  afterAll(async () => {
    await testServer.stop();
  });
  
  test('should provide real-time status updates during processing', async () => {
    const updates: any[] = [];
    
    // Send a message
    const sendResponse = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'What is 2+2?'
      })
    });
    
    expect(sendResponse.ok).toBe(true);
    const { id } = await sendResponse.json();
    expect(id).toBeDefined();
    
    // Poll for updates
    const startTime = Date.now();
    const maxDuration = 15000; // 15 seconds max
    let completed = false;
    
    while (!completed && Date.now() - startTime < maxDuration) {
      const response = await fetch(`${baseUrl}/interactions`);
      const interactions = await response.json();
      
      const interaction = interactions.find((i: any) => i.id === id);
      if (interaction) {
        const update = {
          time: Date.now() - startTime,
          status: interaction.status,
          action: interaction.metadata?.currentAction,
          tokens: interaction.metadata?.tokens
        };
        
        // Only add if something changed
        const lastUpdate = updates[updates.length - 1];
        if (!lastUpdate || 
            lastUpdate.status !== update.status || 
            lastUpdate.action !== update.action ||
            JSON.stringify(lastUpdate.tokens) !== JSON.stringify(update.tokens)) {
          updates.push(update);
        }
        
        if (interaction.status === 'completed') {
          completed = true;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Log the updates for debugging
    console.log('Status updates:');
    updates.forEach(u => {
      console.log(`  ${u.time}ms: ${u.status} - ${u.action || 'no action'}`);
      if (u.tokens?.output > 0) {
        console.log(`    Tokens: ${u.tokens.output}`);
      }
    });
    
    // Verify we got multiple updates
    expect(updates.length).toBeGreaterThan(2);
    
    // Verify we saw different statuses
    const statuses = [...new Set(updates.map(u => u.status))];
    expect(statuses).toContain('queued');
    expect(statuses).toContain('processing');
    expect(statuses).toContain('completed');
    
    // Verify we saw processing status
    const processingUpdates = updates.filter(u => u.status === 'processing');
    expect(processingUpdates.length).toBeGreaterThan(0);
    
    // Verify we got token updates
    const tokenUpdates = updates.filter(u => u.tokens?.output > 0);
    console.log('Token updates:', tokenUpdates.length);
    if (tokenUpdates.length > 0) {
      console.log('Token progression:', tokenUpdates.map(u => u.tokens.output));
    }
  });
  
  test('should include token counts in final response', async () => {
    const sendResponse = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Say hello'
      })
    });
    
    const { id } = await sendResponse.json();
    
    // Wait for completion
    let completed = false;
    let finalInteraction = null;
    const maxWait = 10000;
    const startTime = Date.now();
    
    while (!completed && Date.now() - startTime < maxWait) {
      const response = await fetch(`${baseUrl}/interactions`);
      const interactions = await response.json();
      
      const interaction = interactions.find((i: any) => i.id === id);
      if (interaction?.status === 'completed') {
        completed = true;
        finalInteraction = interaction;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    expect(completed).toBe(true);
    expect(finalInteraction).toBeDefined();
    expect(finalInteraction.metadata).toBeDefined();
    expect(finalInteraction.metadata.tokens).toBeDefined();
    expect(finalInteraction.metadata.tokens.input).toBeGreaterThan(0);
    expect(finalInteraction.metadata.tokens.output).toBeGreaterThan(0);
    expect(finalInteraction.metadata.tokens.total).toBeGreaterThan(0);
    expect(finalInteraction.metadata.model).toBeDefined();
    expect(finalInteraction.metadata.processingTimeMs).toBeGreaterThan(0);
  });
});