import OpenAI from 'openai';
import type { LLMProvider, GenerateOptions } from '../service';

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
  embeddingModel?: string;
  maxTokens?: number;
  baseURL?: string;
}

export class OpenAILLMProvider implements LLMProvider {
  private client: OpenAI;
  private defaultModel: string;
  private embeddingModel: string;
  private defaultMaxTokens: number;
  
  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    });
    this.defaultModel = config.model || 'gpt-4-turbo-preview';
    this.embeddingModel = config.embeddingModel || 'text-embedding-3-small';
    this.defaultMaxTokens = config.maxTokens || 4096;
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      
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
      
      const response = await this.client.chat.completions.create({
        model: options?.model || this.defaultModel,
        messages,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        temperature: options?.temperature ?? 0.7,
        stop: options?.stopSequences
      });
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content in OpenAI response');
      }
      
      return content;
    } catch (error) {
      console.error('[OpenAI] Generation error:', error);
      throw error;
    }
  }
  
  async *stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown> {
    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      
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
      
      const stream = await this.client.chat.completions.create({
        model: options?.model || this.defaultModel,
        messages,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        temperature: options?.temperature ?? 0.7,
        stop: options?.stopSequences,
        stream: true
      });
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('[OpenAI] Streaming error:', error);
      throw error;
    }
  }
  
  generateEmbedding(text: string): number[] {
    // OpenAI provider doesn't provide synchronous embeddings
    // Return a mock embedding for now
    console.warn('[OpenAI] Synchronous embeddings not supported, returning mock');
    return new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
  }
}