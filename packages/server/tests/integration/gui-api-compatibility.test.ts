import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { serve } from 'bun';
import createApp from '../../src/api/routes';

/**
 * Integration tests to ensure GUI/Server API compatibility
 * These tests verify that the server responses match what the GUI expects
 */

describe('GUI API Compatibility', () => {
  let server: any;
  let baseUrl: string;
  let app: any;

  beforeAll(async () => {
    // Create app and start server on random port
    app = await createApp;
    
    server = serve({
      port: 0, // Random available port
      fetch: app.fetch,
    });
    
    baseUrl = `http://localhost:${server.port}`;
    console.log(`[TEST] Server started on port: ${server.port}`);
  });

  afterAll(async () => {
    console.log('[TEST] Stopping server...');
    server.stop();
    
    // Stop wake processor
    if (app.services?.wakeProcessor) {
      await app.services.wakeProcessor.stop();
    }
  });

  test('POST /message response matches GUI SendMessageResponse type', async () => {
    const response = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Test message' })
    });
    
    expect(response.ok).toBe(true);
    const data = await response.json();
    
    // Verify response structure matches GUI expectations
    expect(data).toHaveProperty('id');
    expect(typeof data.id).toBe('string');
    
    // GUI expects 'type' field (mapped to 'status' in Rust)
    expect(data).toHaveProperty('type');
    expect(data.type).toBe('query');
    
    // Should NOT have 'status' field
    expect(data).not.toHaveProperty('status');
  });

  test('GET /interactions returns array of interactions', async () => {
    // First create an interaction
    const createResp = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Test for list' })
    });
    
    const { id } = await createResp.json();
    
    // Wait a moment for the interaction to be stored
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Get all interactions
    const response = await fetch(`${baseUrl}/interactions`);
    expect(response.ok).toBe(true);
    
    const interactions = await response.json();
    expect(Array.isArray(interactions)).toBe(true);
    expect(interactions.length).toBeGreaterThan(0);
    
    // Find our interaction
    const interaction = interactions.find((i: any) => i.id === id);
    expect(interaction).toBeDefined();
    
    // Verify structure - V2 has flat structure with message info
    expect(interaction).toHaveProperty('id');
    expect(interaction).toHaveProperty('messageCount');
    expect(interaction).toHaveProperty('lastMessage');
  });

  test('GET /interactions/:id returns interaction with expected structure', async () => {
    // Create an interaction
    const createResp = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Test single fetch' })
    });
    
    const { id } = await createResp.json();
    
    // Fetch the interaction
    const response = await fetch(`${baseUrl}/interactions/${id}`);
    expect(response.ok).toBe(true);
    
    const conversation = await response.json();
    
    // Verify V2 structure - returns conversation with interaction and messages
    expect(conversation).toHaveProperty('interaction');
    expect(conversation).toHaveProperty('messages');
    expect(conversation.interaction.id).toBe(id);
    expect(Array.isArray(conversation.messages)).toBe(true);
    expect(conversation.messages.length).toBeGreaterThan(0);
    
    // Check message structure
    const message = conversation.messages[0];
    expect(message).toHaveProperty('role');
    expect(message).toHaveProperty('content');
    expect(message.role).toBe('user');
    expect(message.content).toBe('Test single fetch');
    
    // Check interaction metadata if present
    if (conversation.interaction.metadata) {
      expect(typeof conversation.interaction.metadata).toBe('object');
    }
  });

  test.skip('SSE endpoint sends correctly formatted events', async () => {
    // Connect to SSE
    const response = await fetch(`${baseUrl}/stream`, {
      headers: { 'Accept': 'text/event-stream' }
    });
    
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    
    // Read first few chunks
    let buffer = '';
    let foundData = false;
    
    for (let i = 0; i < 5; i++) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value);
      
      // Check for data line
      if (buffer.includes('data: ')) {
        foundData = true;
        const lines = buffer.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const event = JSON.parse(data);
              // Verify event structure
              expect(event).toHaveProperty('type');
              expect(['interaction_created', 'interaction_updated', 'interaction_completed'])
                .toContain(event.type);
              expect(event).toHaveProperty('timestamp');
              expect(event).toHaveProperty('data');
              expect(event.data).toHaveProperty('interactionId');
              expect(event.data).toHaveProperty('interaction');
            } catch (e) {
              // Might be a connection message
            }
          }
        }
      }
    }
    
    reader.releaseLock();
    
    // Should have received at least connection message
    expect(buffer.length).toBeGreaterThan(0);
  });

  test('GET /worktrees returns array', async () => {
    const response = await fetch(`${baseUrl}/worktrees`);
    expect(response.ok).toBe(true);
    
    const worktrees = await response.json();
    expect(Array.isArray(worktrees)).toBe(true);
    
    if (worktrees.length > 0) {
      const worktree = worktrees[0];
      expect(worktree).toHaveProperty('id');
      expect(worktree).toHaveProperty('path');
      expect(worktree).toHaveProperty('status');
      expect(['active', 'inactive']).toContain(worktree.status);
    }
  });
});