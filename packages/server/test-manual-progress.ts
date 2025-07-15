#!/usr/bin/env bun

/**
 * Manual test script to verify progress updates
 */

import { WakeAgent } from './src/agents/wake';
import { InteractionBus } from './src/interaction/bus';
import { LLMService, MockLLMProvider } from './src/llm/service';
import { Interaction, InteractionType } from './src/interaction/types';

async function testProgressUpdates() {
  console.log('=== Testing Wake Agent Progress Updates ===\n');
  
  // Set up services
  const interactionBus = new InteractionBus();
  const llmService = new LLMService('mock');
  const mockProvider = new MockLLMProvider();
  llmService.registerProvider('mock', mockProvider);
  const wakeAgent = new WakeAgent(interactionBus, llmService, false);
  
  // Track events
  const events: any[] = [];
  interactionBus.subscribe(event => {
    events.push(event);
    if (event.type === 'interaction_updated' && event.data.metadata?.currentAction) {
      console.log(`[Progress] ${event.data.metadata.currentAction}`);
    }
  });
  
  // Set up mock to delay and provide token updates
  mockProvider.completeWithTools = async (messages, tools, options) => {
    console.log('[Mock] Starting response generation...');
    
    const totalTokens = 50;
    for (let i = 0; i < totalTokens; i += 5) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (options?.onTokenUpdate) {
        await options.onTokenUpdate(i);
      }
    }
    
    return {
      content: 'Bicamrl is a concurrent interaction development environment that explores new paradigms for human-AI collaboration.',
      model: 'mock',
      usage: {
        inputTokens: 15,
        outputTokens: totalTokens,
        totalTokens: 65
      }
    };
  };
  
  // Create and post interaction
  const interaction = Interaction.create({
    source: 'user',
    type: InteractionType.QUERY,
    initialMessage: 'What is Bicamrl?'
  });
  
  await interactionBus.post(interaction);
  console.log(`Created interaction: ${interaction.id}\n`);
  
  // Process interaction
  const workInteraction = await interactionBus.popForWork(
    wakeAgent.agentId,
    (i) => wakeAgent.isRelevantInteraction(i),
    wakeAgent.interestedInTypes()
  );
  
  if (workInteraction) {
    console.log('Processing interaction...\n');
    const result = await wakeAgent.processInteraction(workInteraction);
    
    console.log('\n=== Processing Complete ===');
    console.log(`Response: ${result.response}`);
    console.log(`Tokens: ${result.usage?.outputTokens}`);
    console.log(`Model: ${result.model}`);
    
    // Check progress events
    const progressEvents = events.filter(e => 
      e.type === 'interaction_updated' && 
      e.data.metadata?.currentAction
    );
    
    console.log(`\nTotal progress events: ${progressEvents.length}`);
    console.log('currentAction cleared:', result.metadata?.currentAction === undefined);
  }
}

// Run the test
testProgressUpdates().catch(console.error);