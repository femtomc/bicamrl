import { InteractionBus } from '../interaction/bus';
import { Interaction, InteractionType } from '../interaction/types';
import { LLMService } from '../llm/service';

/**
 * Agent - Base class for processing agents
 */
export abstract class Agent {
  protected agentId: string;
  protected interactionBus: InteractionBus;
  protected llmService: LLMService;
  
  constructor(
    agentId: string,
    interactionBus: InteractionBus,
    llmService: LLMService
  ) {
    this.agentId = agentId;
    this.interactionBus = interactionBus;
    this.llmService = llmService;
  }
  
  abstract interestedInTypes(): InteractionType[];
  abstract isRelevantInteraction(interaction: Interaction): boolean;
  abstract processInteraction(interaction: Interaction): Promise<any>;
  
  async run(): Promise<void> {
    const interestedTypes = this.interestedInTypes();
    console.log(`[Agent:${this.agentId}] Starting, interested in types:`, interestedTypes);
    
    while (true) {
      const interaction = await this.interactionBus.popForWork(
        this.agentId,
        (i) => this.isRelevantInteraction(i),
        interestedTypes
      );
      
      if (!interaction) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      console.log(`[Agent:${this.agentId}] Got interaction:`, interaction.id);
      
      try {
        const result = await this.processInteraction(interaction);
        console.log(`[Agent:${this.agentId}] Submitting result:`, result);
        
        // Keep interaction alive if waiting for permission
        const needsMoreWork = result.metadata?.status === 'waiting_for_permission';
        
        await this.interactionBus.submitWork(
          interaction,
          this.agentId,
          result,
          needsMoreWork
        );
      } catch (error) {
        console.error(`[Agent:${this.agentId}] Error:`, error);
        await this.interactionBus.submitWork(
          interaction,
          this.agentId,
          { error: String(error) },
          false
        );
      }
    }
  }
}