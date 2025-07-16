import { v4 as uuidv4 } from 'uuid';

/**
 * Message represents an individual message within an Interaction
 * This is separate from Interaction which is just the container
 */

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type MessageStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface MessageMetadata {
  // LLM-related metadata
  model?: string;
  usage?: TokenUsage;
  processingTimeMs?: number;
  
  // Tool-related metadata
  toolsUsed?: string[];
  toolCall?: {
    id: string;
    name: string;
    arguments: any;
  };
  toolResult?: {
    success: boolean;
    output?: string;
    error?: string;
  };
  
  // Permission-related metadata
  permissionRequest?: {
    toolName: string;
    description: string;
    requestId: string;
  };
  permissionResponse?: boolean;
}

export interface MessageData {
  readonly id: string;
  readonly interactionId: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: Date;
  readonly status: MessageStatus;
  readonly metadata?: MessageMetadata;
}

export class Message {
  constructor(
    public readonly data: MessageData
  ) {}

  static create(params: {
    interactionId: string;
    role: MessageRole;
    content: string;
    metadata?: MessageMetadata;
  }): Message {
    const data: MessageData = {
      id: uuidv4(),
      interactionId: params.interactionId,
      role: params.role,
      content: params.content,
      timestamp: new Date(),
      status: params.role === 'user' ? 'pending' : 'completed',
      metadata: params.metadata
    };
    
    return new Message(data);
  }

  // Immutable update methods
  withStatus(status: MessageStatus): Message {
    return new Message({
      ...this.data,
      status
    });
  }

  withMetadata(metadata: MessageMetadata): Message {
    return new Message({
      ...this.data,
      metadata: { ...this.data.metadata, ...metadata }
    });
  }

  // Convenience getters
  get id(): string { return this.data.id; }
  get interactionId(): string { return this.data.interactionId; }
  get role(): MessageRole { return this.data.role; }
  get content(): string { return this.data.content; }
  get timestamp(): Date { return this.data.timestamp; }
  get status(): MessageStatus { return this.data.status; }
  get metadata(): MessageMetadata | undefined { return this.data.metadata; }

  toJSON(): any {
    return {
      id: this.data.id,
      interactionId: this.data.interactionId,
      role: this.data.role,
      content: this.data.content,
      timestamp: this.data.timestamp,
      status: this.data.status,
      metadata: this.data.metadata
    };
  }
}