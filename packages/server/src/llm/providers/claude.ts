import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, GenerateOptions, LLMResponse, TokenUsage } from '../service';

export interface ClaudeConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class ClaudeLLMProvider implements LLMProvider {
  private client: Anthropic;
  private defaultModel: string;
  private defaultMaxTokens: number;
  
  constructor(config: ClaudeConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.defaultModel = config.model || 'claude-3-sonnet-20240229';
    this.defaultMaxTokens = config.maxTokens || 4096;
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        temperature: options?.temperature ?? 0.7,
        system: options?.systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        stop_sequences: options?.stopSequences
      });
      
      // Extract text from response
      const content = response.content[0];
      if (content && 'type' in content && content.type === 'text' && 'text' in content) {
        return content.text;
      }
      
      throw new Error('Unexpected response format from Claude');
    } catch (error) {
      console.error('[Claude] Generation error:', error);
      throw error;
    }
  }
  
  async *stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown> {
    try {
      const stream = await this.client.messages.create({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        temperature: options?.temperature ?? 0.7,
        system: options?.systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        stop_sequences: options?.stopSequences,
        stream: true
      });
      
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && 
            chunk.delta.type === 'text_delta') {
          yield chunk.delta.text;
        }
      }
    } catch (error) {
      console.error('[Claude] Streaming error:', error);
      throw error;
    }
  }
  
  // Claude doesn't provide embeddings directly, would need a separate service
  generateEmbedding(text: string): number[] {
    throw new Error('Claude does not support embeddings. Use OpenAI or another embedding provider.');
  }

  async completeWithTools(messages: any[], tools: any[], options?: GenerateOptions): Promise<LLMResponse> {
    try {
      const response = await this.client.messages.create({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        temperature: options?.temperature ?? 0.7,
        system: options?.systemPrompt,
        messages: messages,
        stop_sequences: options?.stopSequences
      });
      
      // Extract text from response
      const content = response.content[0];
      if (content && 'type' in content && content.type === 'text' && 'text' in content) {
        // Extract usage if available
        let usage: TokenUsage | undefined;
        if (response.usage) {
          usage = {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens
          };
        }
        
        return {
          content: content.text,
          model: response.model,
          usage
        };
      }
      
      throw new Error('Unexpected response format from Claude');
    } catch (error) {
      console.error('[Claude] completeWithTools error:', error);
      throw error;
    }
  }
}