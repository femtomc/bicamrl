/**
 * Tool Executor for Wake Process
 * Simply handles permission requests and lets Claude Code execute its own tools
 */

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
    private requestPermission: (request: any) => Promise<boolean>
  ) {}

  async execute(toolCall: any): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      console.log(`[ToolExecutor] Tool call: ${toolCall.name}`);
      console.log(`[ToolExecutor] Arguments:`, JSON.stringify(toolCall.arguments, null, 2));
      
      // Request permission for any tool call
      const approved = await this.requestPermission({
        toolName: toolCall.name,
        description: this.getToolDescription(toolCall.name),
        arguments: toolCall.arguments
      });
      
      if (!approved) {
        return {
          success: false,
          error: 'Permission denied'
        };
      }
      
      // Permission granted - Claude Code will handle the actual execution
      return {
        success: true,
        result: 'Permission granted'
      };
    } catch (error: any) {
      console.error('[ToolExecutor] Error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
  
  private getToolDescription(toolName: string): string {
    // Provide human-readable descriptions for common Claude Code tools
    const descriptions: Record<string, string> = {
      'Read': 'Read the contents of a file',
      'Write': 'Write or modify a file',
      'LS': 'List files in a directory',
      'Bash': 'Execute a shell command',
      'Grep': 'Search for patterns in files',
      'TodoWrite': 'Update your todo list',
      'WebSearch': 'Search the web for information',
      'MCPTool': 'Execute an MCP (Model Context Protocol) tool'
    };
    
    return descriptions[toolName] || `Execute ${toolName} tool`;
  }
}