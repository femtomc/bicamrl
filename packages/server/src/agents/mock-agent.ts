import type { Agent, AgentResponse } from './types';
import type { Interaction } from '../interaction/types';
import type { Message } from '../message/types';

/**
 * MockAgent - Simple agent for testing that returns predictable responses
 */
export class MockAgent implements Agent {
  id: string;
  
  constructor(
    private interactionId: string,
    private config: any = {}
  ) {
    this.id = `mock-${interactionId}`;
  }

  async initialize(): Promise<void> {
    console.log(`[MockAgent] Initialized for interaction ${this.interactionId}`);
  }

  async process(interaction: Interaction, messages: Message[]): Promise<AgentResponse> {
    // Get the last user message
    const userMessages = messages.filter(m => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];
    
    if (!lastUserMessage) {
      return {
        content: 'No user message found',
        metadata: { model: 'mock-model' }
      };
    }

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    // Return different responses based on content
    const content = lastUserMessage.content.toLowerCase();
    
    if (content.includes('error')) {
      throw new Error('Mock error as requested');
    }

    // Check for specific file requests first
    if (content.includes('test-file.txt')) {
      // For worktree test
      return {
        content: 'I found the content of test-file.txt: Hello from worktree',
        metadata: { model: 'mock-model' }
      };
    }

    if (content.includes('data.txt')) {
      // For concurrent worktree test
      return {
        content: 'The file contains: Data from worktree',
        metadata: { model: 'mock-model' }
      };
    }

    if (content.includes('outside.txt') || content.includes('/var/') || content.includes('/tmp/')) {
      // For boundary test
      return {
        content: 'Error: Cannot access file outside worktree boundary',
        metadata: { model: 'mock-model' }
      };
    }

    if (content.includes('tool') || content.includes('read')) {
      // Simulate tool call - only if not handled by specific file checks above
      return {
        content: 'I would use the Read tool to help with that.',
        toolCalls: [{
          id: 'mock-call-1',
          name: 'Read',
          arguments: { path: 'README.md' }
        }],
        metadata: {
          model: 'mock-model',
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30
          },
          toolsUsed: ['Read']
        }
      };
    }

    if (content.includes('delete')) {
      // Simulate dangerous tool call
      return {
        content: 'I need to delete files as requested.',
        toolCalls: [{
          id: 'mock-call-2',
          name: 'Delete',
          arguments: { path: '*' }
        }],
        metadata: {
          model: 'mock-model',
          toolsUsed: ['Delete']
        }
      };
    }

    if (content.includes('hello')) {
      return {
        content: 'Hello! How can I help you today?',
        metadata: {
          model: 'mock-model',
          usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 }
        }
      };
    }

    if (content.includes('alice')) {
      // For conversation context test
      return {
        content: 'I remember you said your name is Alice.',
        metadata: { model: 'mock-model' }
      };
    }

    // Default response
    return {
      content: `Mock response to: ${lastUserMessage.content}`,
      metadata: {
        model: 'mock-model',
        usage: {
          inputTokens: lastUserMessage.content.length,
          outputTokens: 50,
          totalTokens: lastUserMessage.content.length + 50
        }
      }
    };
  }

  async handleToolCall(toolCall: any): Promise<any> {
    // Mock tool execution
    console.log(`[MockAgent] Handling tool call: ${toolCall.name}`);
    
    return {
      success: true,
      result: `Mock result for ${toolCall.name}`
    };
  }

  async cleanup(): Promise<void> {
    console.log(`[MockAgent] Cleaned up for interaction ${this.interactionId}`);
  }
}