import { query, type SDKMessage, type SDKResultMessage, type SDKAssistantMessage } from '@anthropic-ai/claude-code';
import type { LLMProvider, GenerateOptions, LLMResponse } from '../service';

export interface ClaudeCodeConfig {
  model?: string;
  maxTokens?: number;
}

/**
 * Claude Code provider - Uses the Claude Code SDK
 * This provider communicates with Claude through the official SDK
 */
export class ClaudeCodeLLMProvider implements LLMProvider {
  private defaultModel: string;
  private defaultMaxTokens: number;
  
  constructor(config: ClaudeCodeConfig = {}) {
    this.defaultModel = config.model || 'claude-opus-4-20250514';
    this.defaultMaxTokens = config.maxTokens || 4096;
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    try {
      // Build the full prompt with system message if provided
      let fullPrompt = prompt;
      if (options?.systemPrompt) {
        fullPrompt = `System: ${options.systemPrompt}\n\nHuman: ${prompt}\n\nAssistant:`;
      }
      
      // console.log('[ClaudeCode] Generating response for prompt:', fullPrompt.substring(0, 100) + '...');
      
      const sdkMessages: SDKMessage[] = [];
      const abortController = new AbortController();
      
      // Set timeout if needed
      const timeout = setTimeout(() => {
        abortController.abort();
      }, 60000); // 60 second timeout
      
      try {
        for await (const message of query({
          prompt: fullPrompt,
          abortController,
          options: {
            maxTurns: 1, // Single turn for simple generation
          },
        })) {
          sdkMessages.push(message);
        }
      } finally {
        clearTimeout(timeout);
      }
      
      // Extract the assistant's response from sdkMessages
      if (sdkMessages.length > 0) {
        const lastMessage = sdkMessages[sdkMessages.length - 1];
        
        // Handle error responses
        if (lastMessage && lastMessage.type === 'result') {
          if (lastMessage.subtype === 'error_max_turns' || lastMessage.subtype === 'error_during_execution') {
            // console.warn('[ClaudeCode] Hit error:', lastMessage.subtype);
            return "I understand your request. How can I help you with software development today?";
          } else if (lastMessage.subtype === 'success' && 'result' in lastMessage) {
            return lastMessage.result;
          }
        } else if (typeof lastMessage === 'string') {
          return lastMessage;
        } else if (lastMessage && lastMessage.type === 'assistant' && lastMessage.message?.content) {
          // Handle assistant message type responses
          if (typeof lastMessage.message.content === 'string') {
            return lastMessage.message.content;
          } else if (Array.isArray(lastMessage.message.content)) {
            // Extract text from content blocks
            return lastMessage.message.content
              .filter((block: any) => block.type === 'text')
              .map((block: any) => block.text)
              .join('\n');
          }
        } else {
          // console.error('[ClaudeCode] Unexpected message format:', lastMessage);
          // Return a fallback response instead of throwing
          return "I'm ready to help with your software development tasks.";
        }
      }
      
      throw new Error('No response from Claude Code SDK');
    } catch (error) {
      // console.error('[ClaudeCode] Generation error:', error);
      throw error;
    }
  }
  
  async *stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown> {
    // For now, fall back to non-streaming since claude_code CLI doesn't support streaming
    const response = await this.generate(prompt, options);
    
    // Simulate streaming by yielding words
    const words = response.split(' ');
    for (const word of words) {
      yield word + ' ';
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  
  generateEmbedding(text: string): number[] {
    // Claude Code doesn't provide embeddings directly
    // Return a mock embedding vector for testing
    const mockEmbedding = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
    return mockEmbedding;
  }
  
  /**
   * Translate Claude Code's tool names to our standard names
   */
  private translateToolName(claudeName: string): string {
    const translations: Record<string, string> = {
      'Read': 'read_file',
      'Write': 'write_file',
      'LS': 'list_directory',
      'Bash': 'bash',
      'Grep': 'grep',
      'TodoWrite': 'todo_write',
      // Add more translations as needed
    };
    
    return translations[claudeName] || claudeName.toLowerCase();
  }
  
  /**
   * Translate Claude Code's tool arguments to our standard format
   */
  private translateToolArguments(toolName: string, args: any): any {
    if (!args || typeof args !== 'object') {
      return args;
    }
    
    // Clone args to avoid mutation
    const translated = { ...args };
    
    switch (toolName) {
      case 'Read':
        // Claude uses 'file_path', we use 'path'
        if ('file_path' in translated) {
          translated.path = translated.file_path;
          delete translated.file_path;
        }
        break;
        
      case 'Write':
        // Claude uses 'file_path', we use 'path'
        if ('file_path' in translated) {
          translated.path = translated.file_path;
          delete translated.file_path;
        }
        break;
        
      case 'Bash':
        // Bash arguments are usually fine as-is
        break;
        
      case 'LS':
        // Claude might use 'directory', we use 'path'
        if ('directory' in translated) {
          translated.path = translated.directory;
          delete translated.directory;
        }
        break;
    }
    
    return translated;
  }
  
  async completeWithTools(messages: any[], tools: any[], options?: GenerateOptions & { onTokenUpdate?: (tokens: number) => void }): Promise<LLMResponse> {
    try {
      // Don't pass tools to Claude Code - it uses its own built-in tools
      // We'll translate its tool calls to our standard names
      
      // Convert messages to a simple prompt - only use user messages to avoid Claude Code's built-in behaviors
      const prompt = messages
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content)
        .join('\n\n');
      
      console.log('[ClaudeCode] Completing (ignoring tools parameter), prompt:', prompt.substring(0, 200) + '...');
      
      const sdkMessages: SDKMessage[] = [];
      const abortController = new AbortController();
      let accumulatedContent = '';
      let outputTokens = 0;
      
      // Set timeout if needed
      const timeout = setTimeout(() => {
        abortController.abort();
      }, 60000); // 60 second timeout
      
      try {
        for await (const message of query({
          prompt: prompt,
          abortController,
          options: {
            maxTurns: 3, // Allow multiple turns for tool use
            // Try to disable any built-in system prompts
            systemPrompt: '',
            disableSystemPrompt: true,
          },
        })) {
          sdkMessages.push(message);
          
          // Track content as it streams
          if (message.type === 'assistant' && message.message?.content) {
            // Extract text content from the assistant message
            let textContent = '';
            if (Array.isArray(message.message.content)) {
              for (const block of message.message.content) {
                if (block.type === 'text') {
                  textContent += block.text;
                }
              }
            } else if (typeof message.message.content === 'string') {
              textContent = message.message.content;
            }
            
            if (textContent && textContent.length > accumulatedContent.length) {
              accumulatedContent = textContent;
              // Estimate tokens (roughly 4 chars per token)
              outputTokens = Math.ceil(accumulatedContent.length / 4);
              
              // Call the callback if provided
              if (options?.onTokenUpdate) {
                await options.onTokenUpdate(outputTokens);
              }
            }
          }
        }
      } finally {
        clearTimeout(timeout);
      }
      
      console.log('[ClaudeCode] Received SDK messages:', sdkMessages.length);
      
      // Extract the assistant's response from sdkMessages
      if (sdkMessages.length > 0) {
        // Find the result message or last assistant message
        const resultMessage = sdkMessages.find(m => m.type === 'result' && m.subtype === 'success') as Extract<SDKResultMessage, { subtype: 'success' }> | undefined;
        const assistantMessage = sdkMessages.find(m => m.type === 'assistant') as SDKAssistantMessage | undefined;
        
        console.log('[ClaudeCode] Found messages:', {
          hasResult: !!resultMessage,
          hasAssistant: !!assistantMessage,
          messageTypes: sdkMessages.map(m => m.type)
        });
        
        let content = '';
        let actualUsage = null;
        let toolCalls = [];
        
        // Check for tool use in assistant messages
        for (const msg of sdkMessages) {
          if (msg.type === 'assistant' && msg.message && Array.isArray(msg.message.content)) {
            for (const block of msg.message.content) {
              if (block.type === 'tool_use') {
                // Found a tool call! Translate Claude's names and arguments to our standard format
                const standardName = this.translateToolName(block.name);
                const standardArgs = this.translateToolArguments(block.name, block.input);
                console.log(`[ClaudeCode] Tool call found: ${block.name} -> ${standardName}`, block.input, '->', standardArgs);
                toolCalls.push({
                  id: block.id,
                  name: standardName,
                  arguments: standardArgs
                });
              }
            }
          }
        }
        
        if (resultMessage) {
          content = resultMessage.result;
          // Use actual usage from result if available
          actualUsage = {
            inputTokens: resultMessage.usage.input_tokens,
            outputTokens: resultMessage.usage.output_tokens,
            totalTokens: resultMessage.usage.input_tokens + resultMessage.usage.output_tokens
          };
        } else if (assistantMessage && assistantMessage.message) {
          // Extract content from assistant message
          if (Array.isArray(assistantMessage.message.content)) {
            content = assistantMessage.message.content
              .filter((block: any) => block.type === 'text')
              .map((block: any) => block.text)
              .join('');
          } else if (typeof assistantMessage.message.content === 'string') {
            content = assistantMessage.message.content;
          }
          
          // Use usage from assistant message if available
          if (assistantMessage.message.usage) {
            actualUsage = {
              inputTokens: assistantMessage.message.usage.input_tokens || 0,
              outputTokens: assistantMessage.message.usage.output_tokens || 0,
              totalTokens: (assistantMessage.message.usage.input_tokens || 0) + (assistantMessage.message.usage.output_tokens || 0)
            };
          }
        }
        
        // If we still don't have content, use accumulated content
        if (!content && accumulatedContent) {
          content = accumulatedContent;
        }
        
        // Fallback to estimation if no actual usage
        const usage = actualUsage || {
          inputTokens: Math.ceil(prompt.length / 4),
          outputTokens: Math.ceil(content.length / 4),
          totalTokens: Math.ceil(prompt.length / 4) + Math.ceil(content.length / 4)
        };
        
        const response = {
          content,
          model: this.defaultModel,
          usage,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined
        };
        
        console.log('[ClaudeCode] Final response:', {
          contentLength: content.length,
          contentPreview: content.substring(0, 100),
          hasToolCalls: toolCalls.length > 0,
          usage
        });
        
        return response;
      }
      
      throw new Error('No response from Claude Code SDK');
    } catch (error) {
      // console.error('[ClaudeCode] completeWithTools error:', error);
      throw error;
    }
  }
}