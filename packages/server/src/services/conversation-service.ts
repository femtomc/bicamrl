import { InteractionStore } from '../interaction/store';
import { MessageStore } from '../message/store';
import { Interaction, InteractionType } from '../interaction/types';
import { Message } from '../message/types';
import type { SendMessageRequest } from '@bicamrl/shared';
import type { WorktreeManager } from '../worktree/manager';

/**
 * ConversationService - Coordinates interactions and messages
 * 
 * This service handles the creation of interactions and messages,
 * maintaining the clean separation between conversation containers
 * (interactions) and their content (messages).
 */
export class ConversationService {
  constructor(
    private interactionStore: InteractionStore,
    private messageStore: MessageStore,
    private worktreeManager: WorktreeManager
  ) {}

  /**
   * Create a new conversation (interaction + initial message)
   */
  async startConversation(request: SendMessageRequest): Promise<{
    interactionId: string;
    messageId: string;
  }> {
    const { content, worktreeId } = request;
    
    if (!content || content.trim() === '') {
      throw new Error('Content is required');
    }
    
    // Build worktree context if provided
    let worktreeContext = undefined;
    if (worktreeId) {
      const worktree = await this.worktreeManager.getWorktree(worktreeId);
      if (worktree) {
        worktreeContext = {
          worktreeId: worktree.id,
          branch: worktree.branch,
          worktreePath: worktree.path
        };
      }
    }
    
    // Create interaction
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      metadata: worktreeContext ? { worktreeContext } : undefined
    });
    
    await this.interactionStore.create(interaction);
    
    // Create initial message
    const message = Message.create({
      interactionId: interaction.id,
      role: 'user',
      content
    });
    
    await this.messageStore.addMessage(message);
    
    return {
      interactionId: interaction.id,
      messageId: message.id
    };
  }

  /**
   * Add a message to an existing conversation
   */
  async addMessage(interactionId: string, content: string, role: 'user' | 'assistant' = 'user'): Promise<{
    messageId: string;
  }> {
    // Verify interaction exists
    const interaction = this.interactionStore.get(interactionId);
    if (!interaction) {
      throw new Error('Interaction not found');
    }
    
    // Update last activity
    await this.interactionStore.update(interactionId, i => i.updateLastActivity());
    
    // Create message
    const message = Message.create({
      interactionId,
      role,
      content
    });
    
    await this.messageStore.addMessage(message);
    
    return {
      messageId: message.id
    };
  }

  /**
   * Handle message send request (supports both new and existing conversations)
   */
  async handleSendMessage(request: SendMessageRequest): Promise<{
    interactionId: string;
    messageId: string;
    type: 'new_conversation' | 'message_added';
  }> {
    const { interactionId } = request;
    
    if (interactionId) {
      // Add to existing conversation
      const result = await this.addMessage(interactionId, request.content);
      return {
        interactionId,
        messageId: result.messageId,
        type: 'message_added'
      };
    } else {
      // Start new conversation
      const result = await this.startConversation(request);
      return {
        ...result,
        type: 'new_conversation'
      };
    }
  }

  /**
   * Get conversation (interaction + messages)
   */
  async getConversation(interactionId: string): Promise<{
    interaction: any;
    messages: any[];
  } | null> {
    const interaction = this.interactionStore.get(interactionId);
    if (!interaction) {
      return null;
    }
    
    const messages = this.messageStore.getMessagesSerialized(interactionId);
    
    return {
      interaction: interaction.toJSON(),
      messages
    };
  }

  /**
   * Get all conversations with message counts
   */
  async getAllConversations(): Promise<any[]> {
    const interactions = this.interactionStore.getAll();
    
    return interactions.map(interaction => {
      const messages = this.messageStore.getMessages(interaction.id);
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      
      return {
        ...interaction.toJSON(),
        messageCount: messages.length,
        lastMessage: lastMessage?.toJSON(),
        hasUnprocessedMessages: this.messageStore.getPendingMessages(interaction.id).length > 0
      };
    });
  }

  /**
   * Submit assistant response
   */
  async submitAssistantResponse(
    interactionId: string,
    content: string,
    metadata?: any
  ): Promise<void> {
    const message = Message.create({
      interactionId,
      role: 'assistant',
      content,
      metadata
    });
    
    await this.messageStore.addMessage(message);
    
    // Clear currentAction and update last activity
    await this.interactionStore.updateMetadata(interactionId, {
      currentAction: null,
      processor: null,
      startedAt: null
    });
    await this.interactionStore.update(interactionId, i => i.updateLastActivity());
  }

  /**
   * Handle permission request
   */
  async createPermissionRequest(
    interactionId: string,
    toolName: string,
    description: string,
    requestId: string
  ): Promise<string> {
    const message = Message.create({
      interactionId,
      role: 'system',
      content: description,
      metadata: {
        permissionRequest: {
          toolName,
          description,
          requestId
        }
      }
    });
    
    await this.messageStore.addMessage(message);
    return message.id;
  }

  /**
   * Handle permission response
   */
  async handlePermissionResponse(
    interactionId: string,
    approved: boolean
  ): Promise<void> {
    // Find the permission request message
    const messages = this.messageStore.getMessages(interactionId);
    const requestMessage = messages.reverse().find(m => 
      m.metadata?.permissionRequest
    );
    
    if (!requestMessage) {
      throw new Error('No permission request found');
    }
    
    // Add user's response
    const responseMessage = Message.create({
      interactionId,
      role: 'user',
      content: approved ? 'Yes, proceed' : 'No, cancel',
      metadata: {
        permissionResponse: approved
      }
    });
    
    await this.messageStore.addMessage(responseMessage);
  }
}