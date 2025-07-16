/**
 * Agent Factory
 * 
 * Creates the appropriate agent based on the LLM provider.
 * This is a simplified version for now - will be expanded later.
 */

import type { Agent } from './types';
import type { Interaction } from '../interaction/types';
import { ClaudeCodeAgent } from './claude-code-agent';
import { MockAgent } from './mock-agent';

export interface CreateAgentOptions {
  provider: string;
  interactionId: string;
  serverUrl: string;
  config?: Record<string, any>;
}

/**
 * Create an agent for the given provider
 */
export async function createAgent(options: CreateAgentOptions): Promise<Agent> {
  const { provider, interactionId, serverUrl, config } = options;
  
  console.log(`[AgentFactory] Creating agent for provider: ${provider}`);
  
  switch (provider) {
    case 'claude_code':
      const agent = new ClaudeCodeAgent(interactionId, serverUrl, config);
      await agent.initialize();
      return agent;
      
    case 'lmstudio':
      // TODO: Create AgenticWrapper with LMStudioProvider
      throw new Error('LM Studio agent not yet implemented - use claude_code for now');
      
    case 'mock':
      const mockAgent = new MockAgent(interactionId, config);
      await mockAgent.initialize();
      return mockAgent;
      
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}