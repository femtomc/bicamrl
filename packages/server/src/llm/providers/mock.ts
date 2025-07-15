import { LLMProvider, LLMResponse, LLMMessage, LLMTool } from '../types';

export class MockLLMProvider implements LLMProvider {
  type = 'mock' as const;
  private nextResponse: Partial<LLMResponse> = { content: 'Mock response' };
  
  setNextResponse(response: Partial<LLMResponse>) {
    this.nextResponse = response;
  }
  
  async complete({ messages }: { messages: LLMMessage[] }): Promise<LLMResponse> {
    return {
      content: this.nextResponse.content || 'Mock response',
      model: 'mock',
      usage: {
        inputTokens: messages.reduce((acc, m) => acc + m.content.length / 4, 0),
        outputTokens: 10,
        totalTokens: 0
      },
      ...this.nextResponse
    };
  }
  
  async completeWithTools(messages: LLMMessage[], tools: LLMTool[]): Promise<LLMResponse> {
    // Return the configured response, including tool calls if set
    return {
      content: this.nextResponse.content || 'Mock response',
      model: 'mock',
      usage: {
        inputTokens: messages.reduce((acc, m) => acc + m.content.length / 4, 0),
        outputTokens: 10,
        totalTokens: 0
      },
      ...this.nextResponse
    };
  }
}