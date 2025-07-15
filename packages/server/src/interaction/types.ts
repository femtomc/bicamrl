import { v4 as uuidv4 } from 'uuid';

export enum InteractionType {
  QUERY = 'query',
  ACTION = 'action',
  OBSERVATION = 'observation'
}

export interface Message {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: Date;
  readonly metadata?: Record<string, any>;
}

// State machine types
export type InteractionState = 
  | { kind: 'queued' }
  | { kind: 'processing'; processor: string; startedAt: Date }
  | { kind: 'waiting_permission'; tool: string; requestId: string; processor: string }
  | { kind: 'completed'; result: ProcessingResult; completedAt: Date }
  | { kind: 'failed'; error: Error; failedAt: Date };

export interface ProcessingResult {
  response: string;
  model?: string;
  usage?: TokenUsage;
  metadata?: Record<string, any>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// Tool permission types
export interface ToolPermissionMetadata {
  toolName: string;
  toolArgs: any;
  description: string;
  requestId: string;
  approved?: boolean;
}

// Core immutable interaction
export interface InteractionData {
  readonly id: string;
  readonly source: string;
  readonly type: InteractionType;
  readonly messages: ReadonlyArray<Message>;
  readonly createdAt: Date;
}

export class Interaction {
  constructor(
    public readonly data: InteractionData,
    public readonly state: InteractionState = { kind: 'queued' },
    public readonly metadata: Record<string, any> = {}
  ) {}

  static create(params: {
    source: string;
    type: InteractionType;
    initialMessage: string;
  }): Interaction {
    const data: InteractionData = {
      id: uuidv4(),
      source: params.source,
      type: params.type,
      messages: [{
        role: 'user',
        content: params.initialMessage,
        timestamp: new Date()
      }],
      createdAt: new Date()
    };
    
    return new Interaction(data);
  }

  // Immutable update methods
  withState(state: InteractionState): Interaction {
    return new Interaction(this.data, state, this.metadata);
  }

  withMetadata(metadata: Record<string, any>): Interaction {
    return new Interaction(this.data, this.state, metadata);
  }

  withMessage(message: Message): Interaction {
    const newData: InteractionData = {
      ...this.data,
      messages: [...this.data.messages, message]
    };
    return new Interaction(newData, this.state, this.metadata);
  }

  // Compatibility methods
  get id(): string { return this.data.id; }
  get source(): string { return this.data.source; }
  get type(): InteractionType { return this.data.type; }
  get content(): Message[] { return [...this.data.messages]; }
  get timestamp(): Date { return this.data.createdAt; }
  
  get needsWork(): boolean {
    return this.state.kind === 'queued' || 
           (this.state.kind === 'waiting_permission' && this.metadata.permissionResponse !== undefined);
  }
  
  get lockedFor(): string | undefined {
    if (this.state.kind === 'processing' || this.state.kind === 'waiting_permission') {
      return this.state.processor;
    }
    return undefined;
  }

  getInitialQuery(): string | null {
    const firstUserMsg = this.data.messages.find(m => m.role === 'user');
    return firstUserMsg?.content || null;
  }

  // Legacy support - these return new instances
  addConversationItem(role: 'user' | 'assistant' | 'system', content: string, metadata?: Record<string, any>): void {
    // This is a hack for compatibility - we'll update callers later
    const newInteraction = this.withMessage({
      role,
      content,
      timestamp: new Date(),
      metadata
    });
    // Copy new data to this instance (breaks immutability but maintains compatibility)
    (this as any).data = newInteraction.data;
  }

  static fromDict(data: any): Interaction {
    const messages: Message[] = data.content || [];
    const interactionData: InteractionData = {
      id: data.id,
      source: data.source,
      type: data.type,
      messages: messages,
      createdAt: new Date(data.timestamp)
    };
    
    // Map old state to new state
    let state: InteractionState = { kind: 'queued' };
    if (data.metadata?.status === 'waiting_for_permission') {
      state = {
        kind: 'waiting_permission',
        tool: data.metadata.pendingToolCall?.name || '',
        requestId: data.metadata.requestId || uuidv4(),
        processor: 'wake'
      };
    } else if (data.metadata?.status === 'completed') {
      state = {
        kind: 'completed',
        result: { response: '' },
        completedAt: new Date()
      };
    }
    
    return new Interaction(interactionData, state, data.metadata || {});
  }
}

// Legacy compatibility types
export interface ConversationItem extends Message {}
export interface InteractionEvent {
  timestamp: Date;
  agentId: string;
  action: string;
  content: any;
  metadata?: Record<string, any>;
}
export interface ToolPermissionRequest {
  toolName: string;
  description: string;
  arguments: Record<string, any>;
  requestId: string;
}
export interface ToolPermissionResponse {
  requestId: string;
  approved: boolean;
  reason?: string;
}