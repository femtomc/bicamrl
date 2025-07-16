import type { LLMTool } from '../llm/service';
import type { WorktreeContext } from '@bicamrl/shared';
import { WorktreeAwareTool } from './worktree-aware-tool';

export interface ToolPermissionRequest {
  toolName: string;
  description: string;
  requestId?: string;
}

export interface ToolPermissionResponse {
  approved: boolean;
}

export type PermissionPromptFn = (request: ToolPermissionRequest) => Promise<ToolPermissionResponse>;

export class ToolRegistry {
  private tools: Map<string, LLMTool> = new Map();
  private worktreeContext?: WorktreeContext;
  
  constructor() {
    // Permission is now handled in the Wake agent through the interaction
  }
  
  setWorktreeContext(context: WorktreeContext | undefined): void {
    this.worktreeContext = context;
    
    // Update context for all worktree-aware tools
    for (const tool of this.tools.values()) {
      if (tool instanceof WorktreeAwareTool) {
        tool.setWorktreeContext(context);
      }
    }
  }
  
  register(tool: LLMTool): void {
    this.tools.set(tool.name, tool);
    
    // Set worktree context if tool is worktree-aware
    if (tool instanceof WorktreeAwareTool && this.worktreeContext) {
      tool.setWorktreeContext(this.worktreeContext);
    }
  }
  
  getTools(): LLMTool[] {
    return Array.from(this.tools.values());
  }
  
  getTool(name: string): LLMTool | undefined {
    return this.tools.get(name);
  }
  
  getAllTools(): LLMTool[] {
    return Array.from(this.tools.values());
  }
  
  async execute(
    toolName: string,
    args: any
  ): Promise<any> {
    const tool = this.getTool(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    
    // Execute the tool
    try {
      return await tool.execute(args);
    } catch (error) {
      throw new Error(`Tool execution failed: ${error}`);
    }
  }
  
  // Deprecated - kept for backwards compatibility
  async executeWithPermission(
    toolName: string,
    args: any,
    requestId?: string
  ): Promise<any> {
    return this.execute(toolName, args);
  }
}