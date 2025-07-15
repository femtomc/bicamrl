export interface LLMProvider {
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
  generateEmbedding?(text: string): number[];
  stream?(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown>;
  completeWithTools?(messages: any[], tools: any[], options?: GenerateOptions): Promise<LLMResponse>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  model?: string;
  usage?: TokenUsage;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

export interface LLMTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (args: any) => Promise<any>;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  systemPrompt?: string;
  model?: string;
  onTokenUpdate?: (tokens: number) => void | Promise<void>;
}

export class LLMService {
  private providers: Map<string, LLMProvider> = new Map();
  private activeProvider: string;
  
  getProvider(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }
  
  constructor(defaultProvider: string = 'mock') {
    this.activeProvider = defaultProvider;
    console.log(`[LLM] Using provider: ${defaultProvider}`);
  }
  
  registerProvider(name: string, provider: LLMProvider): void {
    this.providers.set(name, provider);
    // console.log(`[LLM] Registered provider: ${name}`);
  }
  
  setActiveProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Provider ${name} not registered`);
    }
    this.activeProvider = name;
    // console.log(`[LLM] Active provider set to: ${name}`);
  }
  
  getActiveProvider(): LLMProvider {
    const provider = this.providers.get(this.activeProvider);
    if (!provider) {
      throw new Error(`No provider registered as ${this.activeProvider}`);
    }
    return provider;
  }
  
  getActiveProviderName(): string {
    return this.activeProvider;
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const provider = this.getActiveProvider();
    try {
      const result = await provider.generate(prompt, options);
      return result;
    } catch (error) {
      console.error(`[LLM] Generation error with ${this.activeProvider}:`, error);
      throw error;
    }
  }
  
  async generateEmbedding(text: string): Promise<number[]> {
    const provider = this.getActiveProvider();
    if (!provider.generateEmbedding) {
      // Fallback to mock embedding
      return this.mockEmbedding(text);
    }
    
    try {
      return provider.generateEmbedding(text);
    } catch (error) {
      console.error(`[LLM] Embedding error with ${this.activeProvider}:`, error);
      // Fallback to mock
      return this.mockEmbedding(text);
    }
  }
  
  async *stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown> {
    const provider = this.getActiveProvider();
    if (!provider.stream) {
      // Fallback to non-streaming
      const result = await provider.generate(prompt, options);
      yield result;
      return;
    }
    
    try {
      for await (const chunk of provider.stream(prompt, options)) {
        yield chunk;
      }
    } catch (error) {
      console.error(`[LLM] Streaming error with ${this.activeProvider}:`, error);
      throw error;
    }
  }
  
  async completeWithTools(messages: any[], tools: any[], options?: GenerateOptions): Promise<LLMResponse> {
    const provider = this.getActiveProvider();
    
    // If provider doesn't support tools, fallback to regular generation
    if (!provider.completeWithTools) {
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      const content = await provider.generate(prompt, options);
      return { content, model: this.activeProvider };
    }
    
    try {
      return await provider.completeWithTools(messages, tools, options);
    } catch (error) {
      console.error(`[LLM] Tool completion error with ${this.activeProvider}:`, error);
      throw error;
    }
  }
  
  private mockEmbedding(text: string): number[] {
    // Simple mock embedding based on text hash
    const hash = text.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    
    // Generate 384-dimensional embedding
    const embedding = new Array(384);
    for (let i = 0; i < 384; i++) {
      embedding[i] = Math.sin(hash * (i + 1)) * 0.1;
    }
    
    return embedding;
  }
}

// Mock provider for testing
export class MockLLMProvider implements LLMProvider {
  private response: any = null;
  private error: Error | null = null;
  private responseFunction: ((messages: any[]) => any) | null = null;
  
  setResponse(response: any): void {
    this.response = response;
    this.error = null;
    this.responseFunction = null;
  }
  
  setError(error: Error): void {
    this.error = error;
    this.response = null;
    this.responseFunction = null;
  }
  
  setResponseFunction(fn: (messages: any[]) => any): void {
    this.responseFunction = fn;
    this.response = null;
    this.error = null;
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    if (this.error) throw this.error;
    if (this.response) return typeof this.response === 'string' ? this.response : this.response.content;
    if (this.responseFunction) {
      const result = this.responseFunction([{ role: 'user', content: prompt }]);
      return typeof result === 'string' ? result : result.content;
    }
    
    // Default mock responses
    if (prompt.includes('analyze')) {
      return JSON.stringify({
        patterns: [{
          name: "Test Pattern",
          description: "A mock pattern for testing",
          confidence: 0.8,
          applicability: "Always"
        }],
        confidence: 0.7
      });
    }
    
    if (prompt.includes('summarize')) {
      return "This is a mock summary of the conversation.";
    }
    
    return "Mock response to: " + prompt.slice(0, 50) + "...";
  }
  
  generateEmbedding(text: string): number[] {
    // Mock 384-dimensional embedding
    return new Array(384).fill(0).map(() => Math.random() * 0.2 - 0.1);
  }
  
  async *stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown> {
    const response = await this.generate(prompt, options);
    const words = response.split(' ');
    
    for (const word of words) {
      yield word + ' ';
      await new Promise(resolve => setTimeout(resolve, 50)); // Simulate streaming delay
    }
  }
  
  async completeWithTools(messages: any[], tools: any[], options?: GenerateOptions): Promise<LLMResponse> {
    if (this.error) throw this.error;
    if (this.response) {
      if (typeof this.response === 'object' && 'content' in this.response) {
        return this.response;
      }
      return { content: this.response };
    }
    if (this.responseFunction) {
      const result = this.responseFunction(messages);
      if (typeof result === 'object' && 'content' in result) {
        return result;
      }
      return { content: result };
    }
    
    // Default behavior
    const lastMessage = messages[messages.length - 1]?.content || '';
    
    // Check if the message is asking to read a file
    if (lastMessage.toLowerCase().includes('read') && lastMessage.toLowerCase().includes('file')) {
      // Extract filename from the message (simple pattern matching)
      const fileMatch = lastMessage.match(/(?:file|read)\s+([^\s]+)/i);
      const fileName = fileMatch ? fileMatch[1] : 'unknown.txt';
      
      return {
        content: `I'll read the file ${fileName} for you.`,
        model: 'mock',
        toolCalls: [{
          id: `call-${Date.now()}`,
          name: 'read_file',
          arguments: { path: fileName }
        }],
        usage: {
          inputTokens: Math.ceil(lastMessage.length / 4),
          outputTokens: 20,
          totalTokens: Math.ceil(lastMessage.length / 4) + 20
        }
      };
    }
    
    const response = `I'll help you with: ${lastMessage}`;
    
    // Mock token counting (roughly 4 chars per token)
    const inputTokens = messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0);
    const outputTokens = Math.ceil(response.length / 4);
    
    // Simulate streaming tokens during the delay
    if (options?.onTokenUpdate) {
      const totalDelay = 2000;
      const updateInterval = 100;
      const updates = totalDelay / updateInterval;
      
      for (let i = 1; i <= updates; i++) {
        await new Promise(resolve => setTimeout(resolve, updateInterval));
        const tokensGenerated = Math.floor((outputTokens * i) / updates);
        await options.onTokenUpdate(tokensGenerated);
      }
    } else {
      // No streaming, just wait
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return {
      content: response,
      model: 'mock',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      }
    };
  }
}