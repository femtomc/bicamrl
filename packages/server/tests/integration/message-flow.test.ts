import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp } from '../../src/api/routes';
import type { Hono } from 'hono';

describe('Message Flow Integration', () => {
  let app: Hono;
  let services: any;

  beforeEach(async () => {
    const appInstance = await createApp({ port: 0 });
    app = appInstance as any;
    services = (app as any).services;
  });

  describe('Message status transitions', () => {
    test('message goes through pending -> processing -> completed', async () => {
      // Send initial message
      const response = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Process this message'
        })
      });

      const result = await response.json();
      const messageId = result.messageId;

      // Check initial status
      let message = services.messageStore.getMessage(messageId);
      expect(message.status).toBe('pending');

      // Simulate Wake processing
      await services.messageStore.updateMessageStatus(messageId, 'processing');
      message = services.messageStore.getMessage(messageId);
      expect(message.status).toBe('processing');

      // Submit assistant response (completes the message)
      await app.request(`/interactions/${result.id}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'I processed your message',
          model: 'claude-3',
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30
          }
        })
      });

      // Original message should be completed
      message = services.messageStore.getMessage(messageId);
      expect(message.status).toBe('completed');

      // Assistant message should be completed
      const messages = services.messageStore.getMessages(result.id);
      const assistantMsg = messages.find(m => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg.status).toBe('completed');
      expect(assistantMsg.metadata.model).toBe('claude-3');
    });

    test('handles failed message status', async () => {
      const response = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'This will fail'
        })
      });

      const result = await response.json();
      const messageId = result.messageId;

      // Update to failed
      await services.messageStore.updateMessageStatus(messageId, 'failed');
      
      const message = services.messageStore.getMessage(messageId);
      expect(message.status).toBe('failed');
    });
  });

  describe('Concurrent message handling', () => {
    test('handles multiple pending messages in order', async () => {
      // Create conversation
      const firstResponse = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'First message'
        })
      });
      const interaction = await firstResponse.json();

      // Add multiple messages quickly
      const messages = [];
      for (let i = 2; i <= 5; i++) {
        const response = await app.request('/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `Message ${i}`,
            interactionId: interaction.id
          })
        });
        const result = await response.json();
        messages.push(result.messageId);
      }

      // All should be pending
      const allMessages = services.messageStore.getMessages(interaction.id);
      const pendingMessages = allMessages.filter(m => m.status === 'pending');
      expect(pendingMessages).toHaveLength(5);

      // Messages should maintain order
      expect(allMessages[0].content).toBe('First message');
      expect(allMessages[1].content).toBe('Message 2');
      expect(allMessages[4].content).toBe('Message 5');
    });
  });

  describe('Permission flow', () => {
    test('creates permission request and handles response', async () => {
      // Create interaction
      const msgResponse = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Execute a dangerous command'
        })
      });
      const interaction = await msgResponse.json();

      // Create permission request
      const permResponse = await app.request(`/interactions/${interaction.id}/permission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: 'bash',
          description: 'Execute rm -rf /',
          requestId: 'req-123'
        })
      });

      expect(permResponse.status).toBe(200);
      const { messageId } = await permResponse.json();

      // Verify permission message
      const permMessage = services.messageStore.getMessage(messageId);
      expect(permMessage.role).toBe('system');
      expect(permMessage.metadata.permissionRequest).toBeDefined();
      expect(permMessage.metadata.permissionRequest.toolName).toBe('bash');

      // Approve permission
      const approvalResponse = await app.request(`/interactions/${interaction.id}/permission/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: true
        })
      });

      expect(approvalResponse.status).toBe(200);

      // Verify permission was recorded
      const updatedMessage = services.messageStore.getMessage(messageId);
      expect(updatedMessage.metadata.permissionResponse).toBeDefined();
      expect(updatedMessage.metadata.permissionResponse.approved).toBe(true);
    });

    test('denies permission request', async () => {
      const msgResponse = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Try something dangerous'
        })
      });
      const interaction = await msgResponse.json();

      // Create permission request
      const permResponse = await app.request(`/interactions/${interaction.id}/permission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: 'write_file',
          description: 'Write to system file'
        })
      });

      const { messageId } = await permResponse.json();

      // Deny permission
      await app.request(`/interactions/${interaction.id}/permission/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: false
        })
      });

      const message = services.messageStore.getMessage(messageId);
      expect(message.metadata.permissionResponse.approved).toBe(false);
    });
  });

  describe('SSE updates', () => {
    test('emits events for message lifecycle', async () => {
      const events: any[] = [];
      
      // Subscribe to SSE
      const unsubscribe = services.interactionStore.subscribe((event: any) => {
        events.push({ source: 'interaction', ...event });
      });
      const unsubscribeMsg = services.messageStore.subscribe((event: any) => {
        events.push({ source: 'message', ...event });
      });

      // Send message
      const response = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Track my events'
        })
      });

      const result = await response.json();

      // Should have interaction:created and message:added events
      expect(events.some(e => e.type === 'interaction:created')).toBe(true);
      expect(events.some(e => e.type === 'message:added')).toBe(true);

      // Update message status
      await services.messageStore.updateMessageStatus(result.messageId, 'processing');

      // Should have message:updated event
      expect(events.some(e => 
        e.type === 'message:updated' && 
        e.data.message.status === 'processing'
      )).toBe(true);

      unsubscribe();
      unsubscribeMsg();
    });
  });

  describe('Error handling', () => {
    test('handles empty content', async () => {
      const response = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: ''
        })
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toBe('Content is required');
    });

    test('handles non-existent interaction', async () => {
      const response = await app.request('/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Message to nowhere',
          interactionId: 'non-existent-id'
        })
      });

      // Should create new interaction instead
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.type).toBe('new_conversation');
      expect(result.id).not.toBe('non-existent-id');
    });

    test('handles result submission for non-existent interaction', async () => {
      const response = await app.request('/interactions/non-existent/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Result for nowhere'
        })
      });

      expect(response.status).toBe(404);
      const error = await response.json();
      expect(error.error).toBe('Interaction not found');
    });
  });
});