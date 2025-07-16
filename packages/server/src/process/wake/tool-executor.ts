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
      console.log(`[ToolExecutor] Raw arguments:`, JSON.stringify(toolCall.arguments, null, 2));
      
      // Map tool names from Claude Code to our tool names
      const toolNameMap: Record<string, string> = {
        'TodoRead': 'read_file',
        'Read': 'read_file',
        'ReadFile': 'read_file',
        'Write': 'write_file',
        'WriteFile': 'write_file',
        'LS': 'list_directory',
        'ListDirectory': 'list_directory'
      };
      
      // Skip tools we don't support
      const unsupportedTools = ['TodoWrite', 'TodoList', 'TodoAdd'];
      if (unsupportedTools.includes(toolCall.name)) {
        console.log(`[ToolExecutor] Skipping unsupported tool: ${toolCall.name}`);
        return {
          success: false,
          error: `Tool ${toolCall.name} is not supported`
        };
      }
      
      const actualToolName = toolNameMap[toolCall.name] || toolCall.name;
      const tool = this.toolRegistry.getTool(actualToolName);
      
      if (!tool) {
        console.error(`[ToolExecutor] Tool not found: ${toolCall.name} (mapped to ${actualToolName})`);
        console.error(`[ToolExecutor] Available tools:`, this.toolRegistry.getTools().map(t => t.name));
        throw new Error(`Tool not found: ${toolCall.name} (mapped to ${actualToolName})`);
      }
      
      // Map arguments based on tool name
      const mappedArgs = this.mapArguments(toolCall.name, toolCall.arguments);
      console.log(`[ToolExecutor] Mapped arguments:`, JSON.stringify(mappedArgs, null, 2));
      
      // Validate required arguments
      console.log(`[ToolExecutor] Tool ${actualToolName} requires:`, tool.inputSchema);
      
      // Request permission
      const approved = await this.requestPermission({
        toolName: actualToolName,
        description: tool.description
      });
      
      if (!approved) {
        return {
          success: false,
          error: 'Permission denied'
        };
      }
      
      // Execute the tool
      const result = await tool.execute(mappedArgs);
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
  
  private mapArguments(toolName: string, args: any): any {
    console.log(`[ToolExecutor] Mapping arguments for ${toolName}:`, args);
    
    // Handle cases where args might be null or undefined
    if (!args || typeof args !== 'object') {
      console.warn(`[ToolExecutor] Invalid arguments:`, args);
      args = {};
    }
    
    let mapped: any;
    
    switch (toolName) {
      case 'TodoRead':
      case 'Read':
      case 'ReadFile':
        mapped = {
          path: args.path || args.file || args.file_path || args.filename || '',
          encoding: args.encoding
        };
        break;
      
      case 'Write':
      case 'WriteFile':
      case 'TodoWrite':
        mapped = {
          path: args.path || args.file || args.file_path || args.filename || '',
          content: args.content || args.data || args.text || '',
          encoding: args.encoding
        };
        break;
      
      case 'LS':
      case 'ListDirectory':
        mapped = {
          path: args.path || args.directory || args.dir || '.'
        };
        break;
      
      default:
        mapped = args;
    }
    
    console.log(`[ToolExecutor] Mapped result:`, mapped);
    return mapped;
  }
}