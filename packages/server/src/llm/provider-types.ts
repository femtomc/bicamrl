/**
 * Split LLM Provider interfaces
 * 
 * Distinguishes between raw LLMs (text in/out) and
 * agentic providers (full agent systems like Claude Code)
 */

import type { Message } from '../message/types';
import type { ToolCall } from './service';

/**
 * Options for LLM generation
 */
export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  model?: string;
  onTokenUpdate?: (tokens: number) => void | Promise<void>;
}

/**
 * Raw LLM provider - just text generation
 * Used by: LM Studio, OpenAI (when not using functions), etc.
 */
export interface RawLLMProvider {
  /**
   * Generate a text completion from messages
   */
  complete(messages: Message[], options?: LLMOptions): Promise<string>;

  /**
   * Stream a text completion
   */
  stream?(messages: Message[], options?: LLMOptions): AsyncGenerator<string>;

  /**
   * Generate embeddings (optional)
   */
  generateEmbedding?(text: string): Promise<number[]>;

  /**
   * Check if provider is healthy
   */
  checkHealth?(): Promise<boolean>;
}

/**
 * Agentic provider configuration
 */
export interface AgenticConfig {
  mcpServerUrl?: string;  // For Claude Code
  maxTurns?: number;
  [key: string]: any;
}

/**
 * Agentic provider response
 */
export interface AgenticResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
}

/**
 * Agentic provider - complete agent system
 * Used by: Claude Code (has built-in tools and reasoning)
 */
export interface AgenticProvider {
  /**
   * Execute an agentic conversation
   * The provider handles its own tool execution, multi-turn reasoning, etc.
   */
  execute(
    messages: Message[], 
    config?: AgenticConfig,
    options?: LLMOptions
  ): Promise<AgenticResponse>;

  /**
   * Check if provider is healthy
   */
  checkHealth?(): Promise<boolean>;
}

/**
 * Provider capabilities declaration
 */
export interface ProviderCapabilities {
  type: 'raw' | 'agentic';
  hasBuiltInTools: boolean;
  supportsStreaming: boolean;
  supportsEmbeddings: boolean;
  maxContextLength: number;
  permissionMode: 'mcp' | 'direct' | 'none';
}

/**
 * Provider metadata
 */
export interface ProviderMetadata {
  name: string;
  displayName: string;
  description: string;
  capabilities: ProviderCapabilities;
  configSchema?: Record<string, any>;  // JSON schema for provider config
}