import type { LLMProvider, LLMResponse } from '../service';

export class MockLLMProvider implements LLMProvider {
  type = 'mock' as const;
  private nextResponse: Partial<LLMResponse> = { content: 'Mock response' };
  
  setNextResponse(response: Partial<LLMResponse>) {
    this.nextResponse = response;
  }
  
  async generate(prompt: string, options?: any): Promise<string> {
    return this.nextResponse.content || 'Mock response';
  }
  
  generateEmbedding(text: string): number[] {
    return new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
  }
  
  async *stream(prompt: string, options?: any): AsyncGenerator<string, void, unknown> {
    const response = await this.generate(prompt, options);
    const words = response.split(' ');
    for (const word of words) {
      yield word + ' ';
    }
  }
  
  async complete({ messages }: { messages: any[] }): Promise<LLMResponse> {
    const inputTokens = Math.floor(messages.reduce((acc, m) => acc + m.content.length / 4, 0));
    const outputTokens = 10;
    return {
      content: this.nextResponse.content || 'Mock response',
      model: 'mock',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      },
      ...this.nextResponse
    };
  }
  
  async completeWithTools(messages: any[], tools: any[]): Promise<LLMResponse> {
    // Return the configured response, including tool calls if set
    const inputTokens = Math.floor(messages.reduce((acc, m) => acc + m.content.length / 4, 0));
    const outputTokens = 10;
    
    // Check if we have a tool result in the messages
    const toolResultMessage = messages.find(m => m.role === 'tool');
    if (toolResultMessage) {
      try {
        const result = JSON.parse(toolResultMessage.content);
        return {
          content: `The file contains: ${result}`,
          model: 'mock',
          usage: {
            inputTokens,
            outputTokens: 20,
            totalTokens: inputTokens + 20
          }
        };
      } catch {
        return {
          content: `I found the content: ${toolResultMessage.content}`,
          model: 'mock',
          usage: {
            inputTokens,
            outputTokens: 15,
            totalTokens: inputTokens + 15
          }
        };
      }
    }
    
    // Check if the last message mentions reading a file
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.content.toLowerCase().includes('read')) {
      // Extract filename from the message
      let filePath = './package.json'; // default
      
      console.log('[Mock] Processing read request:', lastMessage.content);
      
      // Look for specific file patterns
      if (lastMessage.content.includes('test-file.txt') || lastMessage.content.includes('test-file')) {
        filePath = 'test-file.txt';
      } else if (lastMessage.content.includes('data.txt')) {
        filePath = 'data.txt';
      } else if (lastMessage.content.includes('outside.txt')) {
        filePath = lastMessage.content.match(/\/[^\s?]+\.txt/)?.[0] || 'outside.txt';
      } else if (lastMessage.content.toLowerCase().includes('package.json')) {
        filePath = './package.json';
      } else {
        // Try to extract filename from various patterns
        const patterns = [
          /read (?:the )?([^\s]+\.txt) file/i,
          /read (?:the )?file ([^\s]+\.txt)/i,
          /read ([^\s]+\.txt)/i,
          /([^\s]+\.txt)/i
        ];
        
        for (const pattern of patterns) {
          const fileMatch = lastMessage.content.match(pattern);
          if (fileMatch) {
            filePath = fileMatch[1];
            break;
          }
        }
      }
      
      console.log('[Mock] Extracted file path:', filePath);
      
      return {
        content: `I'll read the file for you.`,
        model: 'mock',
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens
        },
        toolCalls: [{
          id: `mock-tool-call-${Date.now()}`,
          name: 'read_file',
          arguments: { path: filePath }
        }],
        ...this.nextResponse
      };
    }
    
    return {
      content: this.nextResponse.content || 'Mock response',
      model: 'mock',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      },
      ...this.nextResponse
    };
  }
}