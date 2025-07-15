import { describe, test, expect, beforeAll } from 'bun:test';
import { LLMService, MockLLMProvider } from '../../src/llm/service';
import { WakeAgent } from '../../src/agents/wake';
import { InteractionBus } from '../../src/interaction/bus';
import { Interaction, InteractionType } from '../../src/interaction/types';

describe('Streaming Token Updates', () => {
  let llmService: LLMService;
  let interactionBus: InteractionBus;
  let wakeAgent: WakeAgent;
  let tokenUpdates: number[] = [];

  beforeAll(() => {
    // Setup LLM service with mock provider
    llmService = new LLMService('mock');
    llmService.registerProvider('mock', new MockLLMProvider());
    
    // Setup interaction bus
    interactionBus = new InteractionBus();
    
    // Setup wake agent
    wakeAgent = new WakeAgent(interactionBus, llmService);
    
    // Listen for interaction_updated events
    interactionBus.subscribe(async (event) => {
      if (event.type === 'interaction_updated' && event.data.metadata?.tokens?.output) {
        tokenUpdates.push(event.data.metadata.tokens.output);
        console.log('Token update captured:', event.data.metadata.tokens.output);
      }
    });
  });

  test.skip('should stream token updates during LLM generation', async () => {
    // Create a test interaction
    const interaction = Interaction.create({
      type: InteractionType.QUERY,
      source: 'user',
      initialMessage: 'Tell me a short story about a robot.'
    });
    
    // Clear previous updates
    tokenUpdates = [];
    
    // Process the interaction
    const result = await wakeAgent.processInteraction(interaction);
    
    // Verify we got a response
    expect(result.response).toBeDefined();
    expect(result.response.length).toBeGreaterThan(0);
    
    // Verify we got token updates during streaming
    console.log('Total token updates received:', tokenUpdates.length);
    console.log('Token progression:', tokenUpdates);
    
    expect(tokenUpdates.length).toBeGreaterThan(0);
    
    // Verify tokens are incrementing
    for (let i = 1; i < tokenUpdates.length; i++) {
      expect(tokenUpdates[i]).toBeGreaterThanOrEqual(tokenUpdates[i - 1]);
    }
    
    // Verify final token count matches usage
    if (result.usage) {
      const finalTokens = tokenUpdates[tokenUpdates.length - 1];
      expect(finalTokens).toBeCloseTo(result.usage.outputTokens, 1);
    }
  });

  test.skip('should call onTokenUpdate callback during streaming', async () => {
    const updates: number[] = [];
    
    const response = await llmService.completeWithTools(
      [{ role: 'user', content: 'Count to 5' }],
      [],
      {
        onTokenUpdate: async (tokens) => {
          updates.push(tokens);
          console.log('Direct callback update:', tokens);
        }
      }
    );
    
    expect(response.content).toBeDefined();
    expect(updates.length).toBeGreaterThan(0);
    
    // Verify updates are increasing
    for (let i = 1; i < updates.length; i++) {
      expect(updates[i]).toBeGreaterThanOrEqual(updates[i - 1]);
    }
  });

});