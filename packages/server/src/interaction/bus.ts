import { Interaction, InteractionType } from './types';

type FilterFunction = (interaction: Interaction) => boolean;
type EventCallback = (event: any) => void | Promise<void>;

export interface InteractionEvent {
  type: 'interaction_posted' | 'interaction_processing' | 'interaction_completed' | 'interaction_updated';
  timestamp: Date;
  data: {
    interactionId: string;
    agentId?: string;
    type?: InteractionType;
    status?: string;
    result?: any;
    metadata?: any;
  };
}

/**
 * InteractionBus - Simple in-memory message queue
 */
export class InteractionBus {
  private interactions: Map<string, Interaction> = new Map(); // All interactions by ID
  private queue: string[] = []; // Just IDs of queued interactions
  private eventListeners: Set<EventCallback> = new Set();

  constructor(sessionId?: string) {}

  subscribe(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  async emitEvent(event: InteractionEvent): Promise<void> {
    for (const listener of this.eventListeners) {
      try {
        await listener(event);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    }
  }

  async post(interaction: Interaction): Promise<string> {
    this.interactions.set(interaction.id, interaction);
    this.queue.push(interaction.id);
    
    await this.emitEvent({
      type: 'interaction_posted',
      timestamp: new Date(),
      data: {
        interactionId: interaction.id,
        type: interaction.type,
        status: 'queued'
      }
    });

    return interaction.id;
  }

  async popForWork(
    agentId: string,
    filterFn?: FilterFunction,
    types?: InteractionType[]
  ): Promise<Interaction | null> {
    for (let i = 0; i < this.queue.length; i++) {
      const interactionId = this.queue[i];
      if (!interactionId) continue;
      const interaction = this.interactions.get(interactionId);
      
      if (!interaction) continue;
      if (!interaction.needsWork) continue;
      
      // Skip if locked for another agent
      if (interaction.lockedFor && interaction.lockedFor !== agentId) continue;
      
      // Skip non-matching types
      if (types && !types.includes(interaction.type)) continue;
      
      // Apply custom filter
      if (filterFn && !filterFn(interaction)) continue;
      
      // Found one! Remove from queue and update state
      this.queue.splice(i, 1);
      
      // Update interaction state to processing
      const updatedInteraction = interaction.withState({
        kind: 'processing',
        processor: agentId,
        startedAt: new Date()
      });
      this.interactions.set(interactionId!, updatedInteraction);
      
      await this.emitEvent({
        type: 'interaction_processing',
        timestamp: new Date(),
        data: {
          interactionId: interaction.id,
          agentId: agentId,
          type: interaction.type,
          status: 'processing'
        }
      });
      
      return updatedInteraction;
    }
    
    return null;
  }

  async submitWork(
    interaction: Interaction,
    agentId: string,
    result: any,
    needsMoreWork: boolean = false
  ): Promise<void> {
    // Update conversation if this is from Wake agent
    let updatedInteraction = interaction;
    if (agentId === 'wake' && result?.response) {
      updatedInteraction = updatedInteraction.withMessage({
        role: 'assistant',
        content: result.response,
        timestamp: new Date(),
        metadata: { agentId, model: result.model }
      });
    }
    
    // Check if this is a permission request
    if (result?.metadata?.status === 'waiting_for_permission' && result?.metadata?.pendingToolCall) {
      // Update to waiting_permission state
      updatedInteraction = updatedInteraction
        .withState({
          kind: 'waiting_permission',
          tool: result.metadata.pendingToolCall.name,
          requestId: result.metadata.pendingToolCall.id,
          processor: agentId
        })
        .withMetadata({
          ...updatedInteraction.metadata,
          ...result.metadata
        });
      
      this.interactions.set(interaction.id, updatedInteraction);
      return;
    }
    
    // Update state based on completion
    if (!needsMoreWork) {
      // Mark as completed
      updatedInteraction = updatedInteraction.withState({
        kind: 'completed',
        result: {
          response: result.response || '',
          model: result.model,
          usage: result.usage,
          metadata: result.metadata
        },
        completedAt: new Date()
      });
      
      this.interactions.set(interaction.id, updatedInteraction);
      
      await this.emitEvent({
        type: 'interaction_completed',
        timestamp: new Date(),
        data: {
          interactionId: interaction.id,
          type: interaction.type,
          status: 'completed',
          result: result
        }
      });
    } else {
      // Reset to queued state and put back in queue
      updatedInteraction = updatedInteraction.withState({ kind: 'queued' });
      this.interactions.set(interaction.id, updatedInteraction);
      this.queue.push(interaction.id);
    }
  }

  getQueueStats(): Record<string, number> {
    let processing = 0;
    let completed = 0;
    
    for (const interaction of this.interactions.values()) {
      if (interaction.state.kind === 'processing' || interaction.state.kind === 'waiting_permission') {
        processing++;
      } else if (interaction.state.kind === 'completed' || interaction.state.kind === 'failed') {
        completed++;
      }
    }
    
    return {
      queueSize: this.queue.length,
      processing,
      completed
    };
  }


  getInteraction(id: string): Interaction | null {
    return this.interactions.get(id) || null;
  }

  getAllInteractions(): any[] {
    const allInteractions: any[] = [];
    
    for (const interaction of this.interactions.values()) {
      let status = 'unknown';
      switch (interaction.state.kind) {
        case 'queued': status = 'queued'; break;
        case 'processing': status = 'processing'; break;
        case 'waiting_permission': status = 'waiting_for_permission'; break;
        case 'completed': status = 'completed'; break;
        case 'failed': status = 'failed'; break;
      }
      
      const interactionData: any = {
        id: interaction.id,
        source: interaction.source,
        interaction_type: interaction.type,
        content: interaction.content,
        timestamp: interaction.timestamp.toISOString(),
        status,
        metadata: interaction.metadata,
        lockedFor: interaction.lockedFor
      };
      
      // If waiting for permission, add permission_request at top level
      if (interaction.state.kind === 'waiting_permission' && interaction.metadata?.toolPermission) {
        interactionData.permission_request = interaction.metadata.toolPermission;
      }
      
      allInteractions.push(interactionData);
    }
    
    return allInteractions;
  }

  async addMessageToInteraction(interactionId: string, message: any): Promise<void> {
    const interaction = this.interactions.get(interactionId);
    
    if (!interaction) {
      throw new Error(`Interaction ${interactionId} not found`);
    }
    
    // Add the message and reset to queued state
    let updatedInteraction = interaction.withMessage(message);
    
    // If it was waiting for permission and user responded, update metadata
    if (interaction.state.kind === 'waiting_permission') {
      const userResponse = message.content.toLowerCase();
      const approved = userResponse.includes('yes') || userResponse.includes('approve');
      updatedInteraction = updatedInteraction.withMetadata({
        ...interaction.metadata,
        permissionResponse: approved
      });
    }
    
    // Reset to queued state if not already queued
    if (interaction.state.kind !== 'queued') {
      updatedInteraction = updatedInteraction.withState({ kind: 'queued' });
      this.queue.push(interactionId);
    }
    
    this.interactions.set(interactionId, updatedInteraction);
    
    // Emit event
    await this.emitEvent({
      type: 'interaction_updated',
      timestamp: new Date(),
      data: {
        interactionId: interaction.id,
        status: 'message_added'
      }
    });
    
    console.log(`[Bus] Added message to interaction ${interactionId}`);
  }

  async respondToPermission(interactionId: string, approved: boolean): Promise<void> {
    const interaction = this.interactions.get(interactionId);
    
    if (!interaction) {
      throw new Error(`Interaction ${interactionId} not found`);
    }
    
    if (interaction.state.kind !== 'waiting_permission') {
      throw new Error(`Interaction ${interactionId} is not waiting for permission`);
    }
    
    // Update metadata with permission response
    let updatedInteraction = interaction.withMetadata({
      ...interaction.metadata,
      permissionResponse: approved
    });
    
    // Reset to queued state
    updatedInteraction = updatedInteraction.withState({ kind: 'queued' });
    this.queue.push(interactionId);
    
    this.interactions.set(interactionId, updatedInteraction);
    
    // Emit event
    await this.emitEvent({
      type: 'interaction_updated',
      timestamp: new Date(),
      data: {
        interactionId: interaction.id,
        status: 'permission_responded'
      }
    });
    
    console.log(`[Bus] Permission response for ${interactionId}: ${approved ? 'approved' : 'denied'}`);
  }

  async closeInteraction(interactionId: string, feedback?: string): Promise<void> {
    const interaction = this.interactions.get(interactionId);
    
    if (!interaction) {
      throw new Error(`Interaction ${interactionId} not found`);
    }
    
    // Update to closed state with feedback
    let updatedInteraction = interaction
      .withState({
        kind: 'completed',
        result: { feedback },
        completedAt: new Date()
      })
      .withMetadata({
        ...interaction.metadata,
        closed: true,
        feedback
      });
    
    this.interactions.set(interactionId, updatedInteraction);
    
    // Emit event
    await this.emitEvent({
      type: 'interaction_updated',
      timestamp: new Date(),
      data: {
        interactionId: interaction.id,
        status: 'closed'
      }
    });
    
    console.log(`[Bus] Closed interaction ${interactionId}`);
  }
}