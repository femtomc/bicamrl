import { EventEmitter } from 'events';
import { Interaction } from './types';

export interface InteractionEvent {
  type: 'interaction:created' | 'interaction:updated';
  timestamp: Date;
  data: {
    interaction: Interaction;
  };
}

/**
 * InteractionStore V2 - Simplified storage for interactions
 * 
 * Key changes:
 * - No queue management (interactions are just stored)
 * - No state tracking (that's in messages now)
 * - Focus on being a simple key-value store
 */
export class InteractionStore extends EventEmitter {
  private interactions: Map<string, Interaction> = new Map();

  /**
   * Create a new interaction
   */
  async create(interaction: Interaction): Promise<string> {
    this.interactions.set(interaction.id, interaction);
    
    this.emit('event', {
      type: 'interaction:created',
      timestamp: new Date(),
      data: { interaction }
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
      type: 'interaction:updated',
      timestamp: new Date(),
      data: { interaction: updated }
    });
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
   * Get interactions by source
   */
  getBySource(source: string): Interaction[] {
    return this.getAll().filter(i => i.source === source);
  }

  /**
   * Get active interactions (those with wake processes)
   */
  getActive(): Interaction[] {
    return this.getAll().filter(i => i.hasActiveWake);
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
   * Get all interactions in a serializable format
   */
  getAllSerialized(): any[] {
    return this.getAll().map(i => i.toJSON());
  }
}