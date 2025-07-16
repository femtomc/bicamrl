import { EventEmitter } from 'events';
import { Message, MessageStatus } from './types';

export interface MessageEvent {
  type: 'message:added' | 'message:updated';
  timestamp: Date;
  data: {
    message: Message;
    interactionId: string;
  };
}

/**
 * MessageStore - Storage for messages within interactions
 * 
 * This is separate from InteractionStore and focuses solely on messages.
 * Messages are append-only within an interaction.
 */
export class MessageStore extends EventEmitter {
  // Store messages by interaction ID for efficient retrieval
  private messagesByInteraction: Map<string, Message[]> = new Map();
  // Store all messages by ID for direct access
  private messagesById: Map<string, Message> = new Map();

  /**
   * Add a new message to an interaction
   */
  async addMessage(message: Message): Promise<void> {
    const interactionId = message.interactionId;
    
    // Add to ID map
    this.messagesById.set(message.id, message);
    
    // Add to interaction's message list
    const messages = this.messagesByInteraction.get(interactionId) || [];
    messages.push(message);
    this.messagesByInteraction.set(interactionId, messages);
    
    // Emit event
    this.emit('event', {
      type: 'message:added',
      timestamp: new Date(),
      data: {
        message,
        interactionId
      }
    });
  }

  /**
   * Get all messages for an interaction
   */
  getMessages(interactionId: string): Message[] {
    return this.messagesByInteraction.get(interactionId) || [];
  }

  /**
   * Get a specific message by ID
   */
  getMessage(messageId: string): Message | null {
    return this.messagesById.get(messageId) || null;
  }

  /**
   * Update message status
   */
  async updateMessageStatus(messageId: string, status: MessageStatus): Promise<void> {
    const message = this.messagesById.get(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    const updated = message.withStatus(status);
    
    // Update in both maps
    this.messagesById.set(messageId, updated);
    
    const interactionMessages = this.messagesByInteraction.get(message.interactionId) || [];
    const index = interactionMessages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      interactionMessages[index] = updated;
    }
    
    // Emit event
    this.emit('event', {
      type: 'message:updated',
      timestamp: new Date(),
      data: {
        message: updated,
        interactionId: message.interactionId
      }
    });
  }

  /**
   * Update message metadata
   */
  async updateMessageMetadata(messageId: string, metadata: any): Promise<void> {
    const message = this.messagesById.get(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    const updated = message.withMetadata(metadata);
    
    // Update in both maps
    this.messagesById.set(messageId, updated);
    
    const interactionMessages = this.messagesByInteraction.get(message.interactionId) || [];
    const index = interactionMessages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      interactionMessages[index] = updated;
    }
    
    // Emit event
    this.emit('event', {
      type: 'message:updated',
      timestamp: new Date(),
      data: {
        message: updated,
        interactionId: message.interactionId
      }
    });
  }

  /**
   * Get the last message in an interaction
   */
  getLastMessage(interactionId: string): Message | null {
    const messages = this.getMessages(interactionId);
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  /**
   * Get pending messages for an interaction
   */
  getPendingMessages(interactionId: string): Message[] {
    const messages = this.getMessages(interactionId);
    return messages.filter(m => m.status === 'pending');
  }

  /**
   * Count messages by role
   */
  countMessagesByRole(interactionId: string, role: string): number {
    const messages = this.getMessages(interactionId);
    return messages.filter(m => m.role === role).length;
  }

  /**
   * Subscribe to events
   */
  subscribe(callback: (event: MessageEvent) => void): () => void {
    this.on('event', callback);
    return () => {
      this.off('event', callback);
    };
  }

  /**
   * Get all messages in a serializable format for API responses
   */
  getMessagesSerialized(interactionId: string): any[] {
    const messages = this.getMessages(interactionId);
    return messages.map(m => m.toJSON());
  }
}