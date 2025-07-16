/**
 * Claude Code Agent
 * 
 * A pass-through agent that delegates to the Claude Code SDK.
 * Claude Code has its own built-in tools and reasoning capabilities,
 * so this agent mainly handles:
 * 1. Setting up MCP server for permissions
 * 2. Converting between our types and Claude Code SDK types
 * 3. Tracking tool usage for metadata
 */

import type { Agent, AgentResponse, ToolResult, PermissionStrategy } from './types';
import type { Interaction } from '../interaction/types';
import type { Message } from '../message/types';
import type { ToolCall } from '../llm/service';
import { ClaudeCodeLLMProvider } from '../llm/providers/claude-code';
import { MCPPermissionStrategy } from './permission-strategies/mcp-permission-strategy';

export class ClaudeCodeAgent implements Agent {
  public readonly id: string;
  private provider: ClaudeCodeLLMProvider;
  private permissionStrategy?: MCPPermissionStrategy;
  private serverUrl: string;
  
  constructor(
    interactionId: string,
    serverUrl: string,
    config?: {
      model?: string;
      maxTokens?: number;
    }
  ) {
    this.id = `claude-code-${interactionId}`;
    this.serverUrl = serverUrl;
    this.provider = new ClaudeCodeLLMProvider(config);
  }

  async initialize(): Promise<void> {
    console.log(`[ClaudeCodeAgent] Initializing for interaction ${this.id}`);
    
    // Setup MCP permission server if needed
    const enablePermissions = process.env.ENABLE_TOOLS === 'true';
    if (enablePermissions) {
      this.permissionStrategy = new MCPPermissionStrategy(
        this.id.replace('claude-code-', ''),
        this.serverUrl
      );
      await this.permissionStrategy.initialize();
    }
  }

  async process(interaction: Interaction, messages: Message[]): Promise<AgentResponse> {
    console.log(`[ClaudeCodeAgent] Processing interaction ${interaction.id}`);
    
    try {
      // Convert messages to format expected by Claude Code
      const claudeMessages = messages
        .filter(msg => msg.role !== 'system' || msg.metadata?.permissionRequest)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      // Track processing time
      const startTime = Date.now();
      
      // Let Claude Code handle everything
      const response = await this.provider.completeWithTools(
        claudeMessages,
        [], // Claude Code has its own tools
        {
          onTokenUpdate: async (tokens) => {
            // Could report progress here if needed
            console.log(`[ClaudeCodeAgent] Tokens generated: ${tokens}`);
          },
          interactionId: interaction.id,
          serverUrl: this.serverUrl
        }
      );

      const processingTime = Date.now() - startTime;

      // Build agent response
      const agentResponse: AgentResponse = {
        content: response.content,
        toolCalls: response.toolCalls,
        metadata: {
          model: response.model,
          usage: response.usage,
          processingTimeMs: processingTime,
          toolsUsed: response.toolCalls?.map(tc => tc.name)
        }
      };

      console.log(`[ClaudeCodeAgent] Completed processing:`, {
        contentLength: agentResponse.content.length,
        toolCallCount: agentResponse.toolCalls?.length || 0,
        processingTimeMs: processingTime
      });

      return agentResponse;
      
    } catch (error) {
      console.error(`[ClaudeCodeAgent] Error processing:`, error);
      throw error;
    }
  }

  async handleToolCall(call: ToolCall): Promise<ToolResult> {
    // Claude Code handles its own tool execution
    // This method might not be used in practice
    console.log(`[ClaudeCodeAgent] Tool call ${call.name} - Claude Code handles internally`);
    
    return {
      success: true,
      result: 'Handled by Claude Code SDK'
    };
  }

  async cleanup(): Promise<void> {
    console.log(`[ClaudeCodeAgent] Cleaning up`);
    
    if (this.permissionStrategy) {
      await this.permissionStrategy.cleanup();
    }
  }
}