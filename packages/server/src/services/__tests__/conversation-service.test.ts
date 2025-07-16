import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { ConversationService } from '../conversation-service';
import { InteractionStore } from '../../interaction/store';
import { MessageStore } from '../../message/store';
import { WorktreeManager } from '../../worktree/manager';
import { InMemoryWorktreeStore } from '../../worktree/memory-store';
import { InteractionType } from '../../interaction/types';
import { MessageStatus } from '../../message/types';

describe('ConversationService', () => {
  let service: ConversationService;
  let interactionStore: InteractionStore;
  let messageStore: MessageStore;
  let worktreeManager: WorktreeManager;

  beforeEach(async () => {
    interactionStore = new InteractionStore();
    messageStore = new MessageStore();
    
    // Create worktree manager with test repo
    const testRepo = '/tmp/test-repo';
    const worktreeStore = new InMemoryWorktreeStore();
    worktreeManager = new WorktreeManager(testRepo, worktreeStore);
    
    service = new ConversationService(interactionStore, messageStore, worktreeManager);
  });

  describe('handleSendMessage', () => {
    test('creates new conversation for first message', async () => {
      const result = await service.handleSendMessage({
        content: 'Hello, world!'
      });

      expect(result.type).toBe('new_conversation');
      expect(result.interactionId).toBeDefined();
      expect(result.messageId).toBeDefined();

      // Verify interaction was created
      const interaction = interactionStore.get(result.interactionId);
      expect(interaction).toBeDefined();
      expect(interaction?.type).toBe(InteractionType.QUERY);

      // Verify message was created
      const message = messageStore.getMessage(result.messageId);
      expect(message).toBeDefined();
      expect(message?.content).toBe('Hello, world!');
      expect(message?.role).toBe('user');
      expect(message?.status).toBe('pending');
    });

    test('adds message to existing conversation', async () => {
      // Create first message
      const first = await service.handleSendMessage({
        content: 'First message'
      });

      // Add second message to same conversation
      const second = await service.handleSendMessage({
        content: 'Second message',
        interactionId: first.interactionId
      });

      expect(second.type).toBe('existing_conversation');
      expect(second.interactionId).toBe(first.interactionId);
      expect(second.messageId).not.toBe(first.messageId);

      // Verify messages in conversation
      const messages = messageStore.getMessages(first.interactionId);
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('First message');
      expect(messages[1].content).toBe('Second message');
    });

    test('creates conversation with worktree context', async () => {
      const result = await service.handleSendMessage({
        content: 'Test with worktree',
        worktreeId: 'wt-123'
      });

      const interaction = interactionStore.get(result.interactionId);
      expect(interaction?.metadata.worktreeContext).toBeDefined();
      expect(interaction?.metadata.worktreeContext?.worktreeId).toBe('wt-123');
    });

    test('throws error when content is empty', async () => {
      await expect(service.handleSendMessage({
        content: ''
      })).rejects.toThrow('Content is required');
    });

    test('updates interaction last activity', async () => {
      const result = await service.handleSendMessage({
        content: 'Test message'
      });

      const interaction = interactionStore.get(result.interactionId);
      const initialActivity = interaction?.metadata.lastActivityAt;

      // Wait a bit and send another message
      await new Promise(resolve => setTimeout(resolve, 10));

      await service.handleSendMessage({
        content: 'Another message',
        interactionId: result.interactionId
      });

      const updated = interactionStore.get(result.interactionId);
      expect(updated?.metadata.lastActivityAt?.getTime()).toBeGreaterThan(
        initialActivity?.getTime() || 0
      );
    });
  });

  describe('getConversation', () => {
    test('assembles full conversation with messages', async () => {
      // Create conversation with multiple messages
      const { interactionId } = await service.handleSendMessage({
        content: 'User message 1'
      });

      await service.submitAssistantResponse(interactionId, 'Assistant response 1');

      await service.handleSendMessage({
        content: 'User message 2',
        interactionId
      });

      await service.submitAssistantResponse(interactionId, 'Assistant response 2');

      // Get assembled conversation
      const conversation = await service.getConversation(interactionId);

      expect(conversation).toBeDefined();
      expect(conversation.id).toBe(interactionId);
      expect(conversation.messages).toHaveLength(4);
      
      // Verify message order and content
      expect(conversation.messages[0].role).toBe('user');
      expect(conversation.messages[0].content).toBe('User message 1');
      expect(conversation.messages[1].role).toBe('assistant');
      expect(conversation.messages[1].content).toBe('Assistant response 1');
      expect(conversation.messages[2].role).toBe('user');
      expect(conversation.messages[2].content).toBe('User message 2');
      expect(conversation.messages[3].role).toBe('assistant');
      expect(conversation.messages[3].content).toBe('Assistant response 2');
    });

    test('returns null for non-existent interaction', async () => {
      const conversation = await service.getConversation('non-existent');
      expect(conversation).toBeNull();
    });
  });

  describe('getAllConversations', () => {
    test('returns all conversations with messages', async () => {
      // Create multiple conversations
      const conv1 = await service.handleSendMessage({
        content: 'Conversation 1'
      });
      await service.submitAssistantResponse(conv1.interactionId, 'Response 1');

      const conv2 = await service.handleSendMessage({
        content: 'Conversation 2'
      });

      const conversations = await service.getAllConversations();

      expect(conversations).toHaveLength(2);
      
      // First conversation has 2 messages
      const first = conversations.find(c => c.id === conv1.interactionId);
      expect(first?.messages).toHaveLength(2);
      
      // Second conversation has 1 message
      const second = conversations.find(c => c.id === conv2.interactionId);
      expect(second?.messages).toHaveLength(1);
    });

    test('returns empty array when no conversations', async () => {
      const conversations = await service.getAllConversations();
      expect(conversations).toHaveLength(0);
    });
  });

  describe('submitAssistantResponse', () => {
    test('adds assistant message to conversation', async () => {
      const { interactionId } = await service.handleSendMessage({
        content: 'User message'
      });

      await service.submitAssistantResponse(
        interactionId,
        'Assistant response',
        {
          model: 'claude-3',
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30
          }
        }
      );

      const messages = messageStore.getMessages(interactionId);
      expect(messages).toHaveLength(2);
      
      const assistant = messages[1];
      expect(assistant.role).toBe('assistant');
      expect(assistant.content).toBe('Assistant response');
      expect(assistant.status).toBe('completed');
      expect(assistant.metadata?.model).toBe('claude-3');
      expect(assistant.metadata?.usage?.totalTokens).toBe(30);
    });

    test('clears currentAction from interaction metadata', async () => {
      const { interactionId } = await service.handleSendMessage({
        content: 'Test'
      });

      // Set processing state
      await interactionStore.updateMetadata(interactionId, {
        currentAction: 'Thinking...',
        processor: 'wake-agent',
        startedAt: new Date()
      });

      // Submit response
      await service.submitAssistantResponse(interactionId, 'Done');

      // Verify processing state was cleared
      const interaction = interactionStore.get(interactionId);
      expect(interaction?.metadata.currentAction).toBeNull();
      expect(interaction?.metadata.processor).toBeNull();
      expect(interaction?.metadata.startedAt).toBeNull();
    });

    test('throws error for non-existent interaction', async () => {
      await expect(
        service.submitAssistantResponse('non-existent', 'Response')
      ).rejects.toThrow('Interaction not found');
    });
  });

  describe('createPermissionRequest', () => {
    test('creates system message with permission metadata', async () => {
      const { interactionId } = await service.handleSendMessage({
        content: 'Test'
      });

      const messageId = await service.createPermissionRequest(
        interactionId,
        'bash',
        'Execute shell command',
        'req-123'
      );

      const message = messageStore.getMessage(messageId);
      expect(message).toBeDefined();
      expect(message?.role).toBe('system');
      expect(message?.content).toContain('Permission required');
      expect(message?.content).toContain('bash');
      expect(message?.metadata?.permissionRequest).toBeDefined();
      expect(message?.metadata?.permissionRequest?.toolName).toBe('bash');
      expect(message?.metadata?.permissionRequest?.requestId).toBe('req-123');
    });

    test('updates interaction with pending permission', async () => {
      const { interactionId } = await service.handleSendMessage({
        content: 'Test'
      });

      const messageId = await service.createPermissionRequest(
        interactionId,
        'read_file',
        'Read file contents'
      );

      const interaction = interactionStore.get(interactionId);
      expect(interaction?.metadata.pendingPermission).toBeDefined();
      expect(interaction?.metadata.pendingPermission?.messageId).toBe(messageId);
      expect(interaction?.metadata.pendingPermission?.toolName).toBe('read_file');
    });
  });

  describe('handlePermissionResponse', () => {
    test('updates permission message with approval', async () => {
      const { interactionId } = await service.handleSendMessage({
        content: 'Test'
      });

      const messageId = await service.createPermissionRequest(
        interactionId,
        'bash',
        'Execute command'
      );

      await service.handlePermissionResponse(interactionId, true);

      const message = messageStore.getMessage(messageId);
      expect(message?.metadata?.permissionResponse).toBeDefined();
      expect(message?.metadata?.permissionResponse?.approved).toBe(true);
      expect(message?.metadata?.permissionResponse?.timestamp).toBeInstanceOf(Date);
    });

    test('updates permission message with denial', async () => {
      const { interactionId } = await service.handleSendMessage({
        content: 'Test'
      });

      const messageId = await service.createPermissionRequest(
        interactionId,
        'write_file',
        'Write to file'
      );

      await service.handlePermissionResponse(interactionId, false);

      const message = messageStore.getMessage(messageId);
      expect(message?.metadata?.permissionResponse?.approved).toBe(false);
    });

    test('clears pending permission from interaction', async () => {
      const { interactionId } = await service.handleSendMessage({
        content: 'Test'
      });

      await service.createPermissionRequest(
        interactionId,
        'bash',
        'Execute command'
      );

      await service.handlePermissionResponse(interactionId, true);

      const interaction = interactionStore.get(interactionId);
      expect(interaction?.metadata.pendingPermission).toBeUndefined();
    });

    test('does nothing if no pending permission', async () => {
      const { interactionId } = await service.handleSendMessage({
        content: 'Test'
      });

      // Should not throw
      await service.handlePermissionResponse(interactionId, true);
    });
  });

  describe('message status management', () => {
    test('updates user message status during processing', async () => {
      const { interactionId, messageId } = await service.handleSendMessage({
        content: 'Process this'
      });

      // Simulate Wake processing
      await messageStore.updateMessageStatus(messageId, 'processing');
      let message = messageStore.getMessage(messageId);
      expect(message?.status).toBe('processing');

      // Complete processing
      await messageStore.updateMessageStatus(messageId, 'completed');
      message = messageStore.getMessage(messageId);
      expect(message?.status).toBe('completed');
    });

    test('handles failed message status', async () => {
      const { messageId } = await service.handleSendMessage({
        content: 'This will fail'
      });

      await messageStore.updateMessageStatus(messageId, 'processing');
      await messageStore.updateMessageStatus(messageId, 'failed');

      const message = messageStore.getMessage(messageId);
      expect(message?.status).toBe('failed');
    });
  });
});