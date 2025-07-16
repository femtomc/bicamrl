/**
 * Tool Executor for Wake Process
 * Handles tool execution and permission management
 */

import type { ToolRegistry } from '../../tools';
import type { LLMTool } from '../../llm/service';

export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

export class ToolExecutor {
  constructor(
    private toolRegistry: ToolRegistry,
    private requestPermission: (request: any) => Promise<boolean>
  ) {}

  getAvailableTools(): any[] {
    const tools = this.toolRegistry.getTools();
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }));
  }

  async execute(toolCall: any): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      console.log(`[ToolExecutor] Executing tool: ${toolCall.name}`);
      console.log(`[ToolExecutor] Arguments:`, JSON.stringify(toolCall.arguments, null, 2));
      
      // The provider has already translated tool names to our standard names
      const tool = this.toolRegistry.getTool(toolCall.name);
      
      if (!tool) {
        console.error(`[ToolExecutor] Tool not found: ${toolCall.name}`);
        console.error(`[ToolExecutor] Available tools:`, this.toolRegistry.getTools().map(t => t.name));
        return {
          success: false,
          error: `Tool ${toolCall.name} is not supported`
        };
      }
      
      // Request permission
      const approved = await this.requestPermission({
        toolName: toolCall.name,
        description: tool.description
      });
      
      if (!approved) {
        return {
          success: false,
          error: 'Permission denied'
        };
      }
      
      // Execute the tool
      const result = await tool.execute(toolCall.arguments);
      console.log(`[ToolExecutor] Tool execution result preview:`, 
        typeof result === 'string' ? result.substring(0, 100) + '...' : result);
      
      return {
        success: true,
        result
      };
    } catch (error: any) {
      console.error('[ToolExecutor] Error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
}