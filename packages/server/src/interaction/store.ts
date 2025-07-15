import { Interaction, InteractionType } from './types';
import { EventEmitter } from 'events';

export interface InteractionEvent {
  type: 'interaction_created' | 'interaction_updated' | 'interaction_completed';
  timestamp: Date;
  data: {
    interactionId: string;
    interaction: Interaction;
  };
}

/**
 * InteractionStore - Simple storage for interactions with event emission
 * 
 * This replaces the complex InteractionBus with a simpler design:
 * - Store interactions by ID
 * - Emit events when interactions change
 * - No queue management (Wake processes are spawned directly)
 */
export class InteractionStore extends EventEmitter {
  private interactions: Map<string, Interaction> = new Map();

  /**
   * Create a new interaction
   */
  async create(interaction: Interaction): Promise<string> {
    this.interactions.set(interaction.id, interaction);
    
    this.emit('event', {
      type: 'interaction_created',
      timestamp: new Date(),
      data: {
        interactionId: interaction.id,
        interaction
      }
    });

    return interaction.id;
  }

  /**
   * Get an interaction by ID
   */
  get(id: string): Interaction | null {
    return this.interactions.get(id) || null;
  }

  /**
   * Get all interactions
   */
  getAll(): Interaction[] {
    return Array.from(this.interactions.values());
  }

  /**
   * Update an interaction
   */
  async update(id: string, updater: (interaction: Interaction) => Interaction): Promise<void> {
    const interaction = this.interactions.get(id);
    if (!interaction) {
      throw new Error(`Interaction ${id} not found`);
    }

    const updated = updater(interaction);
    this.interactions.set(id, updated);

    this.emit('event', {
      type: 'interaction_updated',
      timestamp: new Date(),
      data: {
        interactionId: id,
        interaction: updated
      }
    });
  }

  /**
   * Add a message to an interaction
   */
  async addMessage(id: string, message: any): Promise<void> {
    await this.update(id, interaction => 
      interaction.withMessage(message)
    );
  }

  /**
   * Update interaction metadata
   */
  async updateMetadata(id: string, metadata: any): Promise<void> {
    await this.update(id, interaction =>
      interaction.withMetadata({
        ...interaction.metadata,
        ...metadata
      })
    );
  }

  /**
   * Mark interaction as completed
   */
  async complete(id: string, result: any): Promise<void> {
    await this.update(id, interaction =>
      interaction.withState({
        kind: 'completed',
        result,
        completedAt: new Date()
      })
    );

    const interaction = this.get(id);
    if (interaction) {
      this.emit('event', {
        type: 'interaction_completed',
        timestamp: new Date(),
        data: {
          interactionId: id,
          interaction
        }
      });
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(callback: (event: InteractionEvent) => void): () => void {
    this.on('event', callback);
    return () => {
      this.off('event', callback);
    };
  }

  /**
   * Get all interactions in a serializable format for API responses
   */
  getAllSerialized(): any[] {
    return Array.from(this.interactions.values()).map(interaction => {
      let status = 'unknown';
      switch (interaction.state.kind) {
        case 'queued': status = 'queued'; break;
        case 'processing': status = 'processing'; break;
        case 'waiting_permission': status = 'waiting_for_permission'; break;
        case 'completed': status = 'completed'; break;
        case 'failed': status = 'failed'; break;
      }
      
      return {
        id: interaction.id,
        source: interaction.source,
        interaction_type: interaction.type,
        content: interaction.content,
        timestamp: interaction.timestamp.toISOString(),
        status,
        metadata: interaction.metadata,
        permission_request: interaction.state.kind === 'waiting_permission' && interaction.metadata?.toolPermission 
          ? interaction.metadata.toolPermission 
          : undefined
      };
    });
  }
}