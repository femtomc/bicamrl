import { v4 as uuidv4 } from 'uuid';

/**
 * Interaction V2 - Simplified as a conversation container
 * 
 * Key changes:
 * - No messages array (messages are stored separately)
 * - No state machine (interactions just exist)
 * - Focus on being a container for conversation context
 */

export enum InteractionType {
  QUERY = 'query',
  ACTION = 'action',
  OBSERVATION = 'observation'
}

export interface WorktreeContext {
  worktreeId: string;
  worktreePath: string;
  branch?: string;
}

export interface InteractionMetadata {
  // Permanent context
  worktreeContext?: WorktreeContext;
  
  // Process management
  wakeProcessId?: string;
  sleepProcessId?: string;
  
  // User preferences
  title?: string;
  tags?: string[];
  
  // System metadata
  lastActivityAt?: Date;
}

export interface InteractionData {
  readonly id: string;
  readonly source: string; // Who started it (user, system, agent)
  readonly type: InteractionType;
  readonly createdAt: Date;
  readonly metadata: InteractionMetadata;
}

export class Interaction {
  constructor(
    public readonly data: InteractionData
  ) {}

  static create(params: {
    source: string;
    type: InteractionType;
    metadata?: InteractionMetadata;
  }): Interaction {
    const data: InteractionData = {
      id: uuidv4(),
      source: params.source,
      type: params.type,
      createdAt: new Date(),
      metadata: params.metadata || {}
    };
    
    return new Interaction(data);
  }

  // Immutable update methods
  withMetadata(metadata: InteractionMetadata): Interaction {
    return new Interaction({
      ...this.data,
      metadata: { ...this.data.metadata, ...metadata }
    });
  }

  updateLastActivity(): Interaction {
    return this.withMetadata({
      ...this.data.metadata,
      lastActivityAt: new Date()
    });
  }

  // Convenience getters
  get id(): string { return this.data.id; }
  get source(): string { return this.data.source; }
  get type(): InteractionType { return this.data.type; }
  get createdAt(): Date { return this.data.createdAt; }
  get metadata(): InteractionMetadata { return this.data.metadata; }

  // Process management
  get wakeProcessId(): string | undefined {
    return this.data.metadata.wakeProcessId;
  }

  get hasActiveWake(): boolean {
    return !!this.data.metadata.wakeProcessId;
  }

  // Serialization
  toJSON(): any {
    return {
      id: this.data.id,
      source: this.data.source,
      type: this.data.type,
      createdAt: this.data.createdAt,
      metadata: this.data.metadata
    };
  }
}