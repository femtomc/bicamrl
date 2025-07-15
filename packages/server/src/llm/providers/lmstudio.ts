import type { LLMProvider, GenerateOptions } from '../service';

export interface LMStudioConfig {
  baseURL?: string;
  model?: string;
  maxTokens?: number;
}

interface LMStudioMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LMStudioRequest {
  model: string;
  messages: LMStudioMessage[];
  max_tokens?: number;
  temperature?: number;
  stop?: string[];
  stream?: boolean;
}

interface LMStudioResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LMStudioLLMProvider implements LLMProvider {
  private baseURL: string;
  private defaultModel: string;
  private defaultMaxTokens: number;
  
  constructor(config: LMStudioConfig = {}) {
    this.baseURL = config.baseURL || 'http://localhost:1234/v1';
    this.defaultModel = config.model || 'local-model';
    this.defaultMaxTokens = config.maxTokens || 2048;
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    try {
      const messages: LMStudioMessage[] = [];
      
      if (options?.systemPrompt) {
        messages.push({
          role: 'system',
          content: options.systemPrompt
        });
      }
      
      messages.push({
        role: 'user',
        content: prompt
      });
      
      const request: LMStudioRequest = {
        model: options?.model || this.defaultModel,
        messages,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        temperature: options?.temperature ?? 0.7,
        stop: options?.stopSequences,
        stream: false
      };
      
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });
      
      if (!response.ok) {
        throw new Error(`LM Studio API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json() as LMStudioResponse;
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('No choices in LM Studio response');
      }
      
      return data.choices[0]?.message.content || '';
    } catch (error) {
      console.error('[LMStudio] Generation error:', error);
      throw error;
    }
  }
  
  async *stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown> {
    try {
      const messages: LMStudioMessage[] = [];
      
      if (options?.systemPrompt) {
        messages.push({
          role: 'system',
          content: options.systemPrompt
        });
      }
      
      messages.push({
        role: 'user',
        content: prompt
      });
      
      const request: LMStudioRequest = {
        model: options?.model || this.defaultModel,
        messages,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        temperature: options?.temperature ?? 0.7,
        stop: options?.stopSequences,
        stream: true
      };
      
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(request)
      });
      
      if (!response.ok) {
        throw new Error(`LM Studio API error: ${response.status} ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            
            try {
              const chunk = JSON.parse(data);
              const content = chunk.choices?.[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('[LMStudio] Streaming error:', error);
      throw error;
    }
  }
  
  generateEmbedding(text: string): number[] {
    // LM Studio typically doesn't provide embeddings
    // You would need a separate embedding model or service
    throw new Error('LM Studio does not support embeddings. Use OpenAI or another embedding provider.');
  }
  
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/models`);
      return response.ok;
    } catch {
      return false;
    }
  }
}