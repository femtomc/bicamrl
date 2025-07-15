import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { WakeAgent } from '../wake';
import { InteractionBus } from '../../interaction/bus';
import { LLMService, MockLLMProvider } from '../../llm/service';
import { Interaction, InteractionType } from '../../interaction/types';
import { ClaudeCodeLLMProvider } from '../../llm/providers/claude-code';

describe('Wake Agent Progress Updates', () => {
  let wakeAgent: WakeAgent;
  let interactionBus: InteractionBus;
  let llmService: LLMService;
  let mockProvider: MockLLMProvider;
  let emittedEvents: any[] = [];

  beforeEach(() => {
    interactionBus = new InteractionBus();
    llmService = new LLMService('mock');
    mockProvider = new MockLLMProvider();
    llmService.registerProvider('mock', mockProvider);
    wakeAgent = new WakeAgent(interactionBus, llmService, false);
    
    // Subscribe to events
    interactionBus.subscribe(event => {
      emittedEvents.push(event);
    });
    
    emittedEvents = [];
  });

  afterEach(() => {
    emittedEvents = [];
  });

  it('should emit progress updates during processing', async () => {
    // Create test interaction
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Hello, what is Bicamrl?'
    });
    
    // Post interaction
    await interactionBus.post(interaction);
    
    // Set up mock to delay response to allow progress updates
    mockProvider.setResponseFunction(async (messages) => {
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return {
        content: 'Bicamrl is a concurrent interaction development environment.',
        model: 'mock',
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30
        }
      };
    });
    
    // Process interaction
    const workInteraction = await interactionBus.popForWork(
      wakeAgent.agentId,
      (i) => wakeAgent.isRelevantInteraction(i),
      wakeAgent.interestedInTypes()
    );
    
    expect(workInteraction).toBeTruthy();
    
    if (workInteraction) {
      // Start processing
      const result = await wakeAgent.processInteraction(workInteraction);
      
      // Check for progress updates during processing
      const progressUpdates = emittedEvents.filter(e => 
        e.type === 'interaction_updated' && 
        e.data.metadata?.currentAction
      );
      
      // Should have at least one progress update
      expect(progressUpdates.length).toBeGreaterThan(0);
      
      // Check that we got the initializing message
      const firstUpdate = progressUpdates[0];
      expect(firstUpdate.data.metadata.currentAction).toContain('Initializing');
      
      // Submit work
      await interactionBus.submitWork(workInteraction, wakeAgent.agentId, result);
      
      // Check that currentAction was cleared in the result
      expect(result.metadata?.currentAction).toBeUndefined();
    }
  });

  it('should update token counts in real-time', async () => {
    // Create test interaction
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Tell me about concurrent programming'
    });
    
    // Post interaction
    await interactionBus.post(interaction);
    
    let tokenUpdateCount = 0;
    
    // Set up mock with token updates
    mockProvider.setResponseFunction(async (messages) => {
      return {
        content: 'Concurrent programming is a form of computing...',
        model: 'mock',
        usage: {
          inputTokens: 15,
          outputTokens: 50,
          totalTokens: 65
        }
      };
    });
    
    // Override completeWithTools to simulate token updates
    const originalCompleteWithTools = mockProvider.completeWithTools.bind(mockProvider);
    mockProvider.completeWithTools = async (messages, tools, options) => {
      // Simulate token generation
      if (options?.onTokenUpdate) {
        for (let i = 0; i < 5; i++) {
          await new Promise(resolve => setTimeout(resolve, 50));
          await options.onTokenUpdate(i * 10);
          tokenUpdateCount++;
        }
      }
      return originalCompleteWithTools(messages, tools, options);
    };
    
    // Process interaction
    const workInteraction = await interactionBus.popForWork(
      wakeAgent.agentId,
      (i) => wakeAgent.isRelevantInteraction(i),
      wakeAgent.interestedInTypes()
    );
    
    if (workInteraction) {
      const result = await wakeAgent.processInteraction(workInteraction);
      
      // Check that token updates were called
      expect(tokenUpdateCount).toBeGreaterThan(0);
      
      // Check final token counts
      expect(result.usage?.outputTokens).toBe(50);
    }
  });
});