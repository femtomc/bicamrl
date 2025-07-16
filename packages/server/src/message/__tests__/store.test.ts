import { describe, test, expect, beforeEach } from 'bun:test';
import { MessageStore } from '../store';
import { MessageStatus } from '../types';
import type { MessageEvent } from '../store';

describe('MessageStore', () => {
  let store: MessageStore;
  let emittedEvents: MessageEvent[] = [];

  beforeEach(() => {
    store = new MessageStore();
    emittedEvents = [];
    
    // Capture emitted events
    store.subscribe((event) => {
      emittedEvents.push(event);
    });
  });

  describe('addMessage', () => {
    test('creates message with correct fields', () => {
      const message = store.addMessage('interaction-1', {
        role: 'user',
        content: 'Hello, world!'
      });

      expect(message.id).toBeDefined();
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello, world!');
      expect(message.status).toBe('pending');
      expect(message.timestamp).toBeInstanceOf(Date);
    });

    test('creates message with custom status', () => {
      const message = store.addMessage('interaction-1', {
        role: 'assistant',
        content: 'Hello!',
        status: 'completed'
      });

      expect(message.status).toBe('completed');
    });

    test('creates message with metadata', () => {
      const message = store.addMessage('interaction-1', {
        role: 'assistant',
        content: 'Response',
        metadata: {
          model: 'claude-3',
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30
          }
        }
      });

      expect(message.metadata?.model).toBe('claude-3');
      expect(message.metadata?.usage?.totalTokens).toBe(30);
    });

    test('emits message:added event', () => {
      const message = store.addMessage('interaction-1', {
        role: 'user',
        content: 'Test'
      });

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('message:added');
      expect(emittedEvents[0].data.message).toEqual(message);
      expect(emittedEvents[0].data.interactionId).toBe('interaction-1');
    });

    test('creates tool message', () => {
      const message = store.addMessage('interaction-1', {
        role: 'tool',
        content: 'File contents...',
        metadata: {
          toolCall: {
            id: 'call-123',
            name: 'read_file',
            arguments: { path: '/test.txt' }
          }
        }
      });

      expect(message.role).toBe('tool');
      expect(message.metadata?.toolCall?.name).toBe('read_file');
    });

    test('creates permission request message', () => {
      const message = store.addMessage('interaction-1', {
        role: 'system',
        content: 'Permission required: Execute bash command',
        metadata: {
          permissionRequest: {
            toolName: 'bash',
            description: 'Execute shell command',
            requestId: 'req-123'
          }
        }
      });

      expect(message.metadata?.permissionRequest?.toolName).toBe('bash');
    });
  });

  describe('getMessage', () => {
    test('retrieves message by id', () => {
      const message = store.addMessage('interaction-1', {
        role: 'user',
        content: 'Test'
      });

      const retrieved = store.getMessage(message.id);
      expect(retrieved).toEqual(message);
    });

    test('returns null for non-existent message', () => {
      const retrieved = store.getMessage('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('getMessages', () => {
    test('retrieves all messages for interaction', () => {
      const msg1 = store.addMessage('interaction-1', {
        role: 'user',
        content: 'First'
      });

      const msg2 = store.addMessage('interaction-1', {
        role: 'assistant',
        content: 'Second'
      });

      const msg3 = store.addMessage('interaction-2', {
        role: 'user',
        content: 'Different interaction'
      });

      const messages = store.getMessages('interaction-1');
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual(msg1);
      expect(messages[1]).toEqual(msg2);
    });

    test('returns empty array for interaction with no messages', () => {
      const messages = store.getMessages('interaction-1');
      expect(messages).toHaveLength(0);
    });

    test('maintains message order', () => {
      for (let i = 0; i < 5; i++) {
        store.addMessage('interaction-1', {
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`
        });
      }

      const messages = store.getMessages('interaction-1');
      expect(messages).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(messages[i].content).toBe(`Message ${i}`);
      }
    });
  });

  describe('updateMessage', () => {
    test('updates message content and metadata', () => {
      const message = store.addMessage('interaction-1', {
        role: 'assistant',
        content: 'Original'
      });

      const updated = store.updateMessage(message.id, {
        content: 'Updated content',
        metadata: {
          model: 'claude-3',
          edited: true
        }
      });

      expect(updated?.content).toBe('Updated content');
      expect(updated?.metadata?.edited).toBe(true);
    });

    test('emits message:updated event', () => {
      const message = store.addMessage('interaction-1', {
        role: 'user',
        content: 'Test'
      });

      emittedEvents = []; // Clear add event

      store.updateMessage(message.id, {
        content: 'Updated'
      });

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('message:updated');
      expect(emittedEvents[0].data.message.content).toBe('Updated');
    });

    test('returns null for non-existent message', () => {
      const updated = store.updateMessage('non-existent', {
        content: 'Test'
      });

      expect(updated).toBeNull();
    });
  });

  describe('updateMessageStatus', () => {
    test('updates message status', async () => {
      const message = store.addMessage('interaction-1', {
        role: 'user',
        content: 'Test'
      });

      expect(message.status).toBe('pending');

      await store.updateMessageStatus(message.id, 'processing');
      let updated = store.getMessage(message.id);
      expect(updated?.status).toBe('processing');

      await store.updateMessageStatus(message.id, 'completed');
      updated = store.getMessage(message.id);
      expect(updated?.status).toBe('completed');
    });

    test('emits message:updated event on status change', async () => {
      const message = store.addMessage('interaction-1', {
        role: 'user',
        content: 'Test'
      });

      emittedEvents = [];

      await store.updateMessageStatus(message.id, 'processing');

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('message:updated');
      expect(emittedEvents[0].data.message.status).toBe('processing');
    });

    test('handles status transition to failed', async () => {
      const message = store.addMessage('interaction-1', {
        role: 'user',
        content: 'Test'
      });

      await store.updateMessageStatus(message.id, 'processing');
      await store.updateMessageStatus(message.id, 'failed');

      const updated = store.getMessage(message.id);
      expect(updated?.status).toBe('failed');
    });
  });

  describe('getLastMessage', () => {
    test('returns last message for interaction', () => {
      store.addMessage('interaction-1', {
        role: 'user',
        content: 'First'
      });

      const second = store.addMessage('interaction-1', {
        role: 'assistant',
        content: 'Second'
      });

      store.addMessage('interaction-1', {
        role: 'user',
        content: 'Third'
      });

      // Different interaction
      store.addMessage('interaction-2', {
        role: 'user',
        content: 'Other'
      });

      const last = store.getLastMessage('interaction-1');
      expect(last?.content).toBe('Third');
    });

    test('returns null for interaction with no messages', () => {
      const last = store.getLastMessage('interaction-1');
      expect(last).toBeNull();
    });
  });

  describe('getPendingMessages', () => {
    test('returns only pending messages', () => {
      const pending1 = store.addMessage('interaction-1', {
        role: 'user',
        content: 'Pending 1'
      });

      const processing = store.addMessage('interaction-1', {
        role: 'user',
        content: 'Processing',
        status: 'processing'
      });

      const pending2 = store.addMessage('interaction-1', {
        role: 'user',
        content: 'Pending 2'
      });

      const completed = store.addMessage('interaction-1', {
        role: 'assistant',
        content: 'Completed',
        status: 'completed'
      });

      const pending = store.getPendingMessages('interaction-1');
      expect(pending).toHaveLength(2);
      expect(pending[0]).toEqual(pending1);
      expect(pending[1]).toEqual(pending2);
    });
  });

  describe('event subscription', () => {
    test('supports multiple subscribers', () => {
      const events1: MessageEvent[] = [];
      const events2: MessageEvent[] = [];

      const unsub1 = store.subscribe((event) => events1.push(event));
      const unsub2 = store.subscribe((event) => events2.push(event));

      store.addMessage('interaction-1', {
        role: 'user',
        content: 'Test'
      });

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
      expect(events1[0]).toEqual(events2[0]);

      unsub1();
      unsub2();
    });

    test('unsubscribe stops receiving events', () => {
      const events: MessageEvent[] = [];
      const unsubscribe = store.subscribe((event) => events.push(event));

      store.addMessage('interaction-1', {
        role: 'user',
        content: 'First'
      });

      expect(events).toHaveLength(1);

      unsubscribe();

      store.addMessage('interaction-1', {
        role: 'user',
        content: 'Second'
      });

      expect(events).toHaveLength(1); // No new event
    });
  });

  describe('message ordering', () => {
    test('maintains chronological order within interaction', async () => {
      // Add messages with small delays to ensure different timestamps
      const msg1 = store.addMessage('interaction-1', {
        role: 'user',
        content: 'First'
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const msg2 = store.addMessage('interaction-1', {
        role: 'assistant',
        content: 'Second'
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const msg3 = store.addMessage('interaction-1', {
        role: 'user',
        content: 'Third'
      });

      const messages = store.getMessages('interaction-1');
      expect(messages[0].timestamp.getTime()).toBeLessThanOrEqual(messages[1].timestamp.getTime());
      expect(messages[1].timestamp.getTime()).toBeLessThanOrEqual(messages[2].timestamp.getTime());
    });
  });
});