/**
 * MCP (Model Context Protocol) Permission Strategy
 * 
 * Used by Claude Code SDK which requires an MCP server
 * for handling tool permission requests.
 * 
 * See: https://docs.anthropic.com/en/docs/claude-code/sdk#custom-permission-prompt-tool
 */

import type { PermissionStrategy, PermissionRequest } from '../types';
import { WakeApiClient } from '../../process/wake/api-client';

export class MCPPermissionStrategy implements PermissionStrategy {
  private apiClient: WakeApiClient;

  constructor(
    private interactionId: string,
    serverUrl: string
  ) {
    this.apiClient = new WakeApiClient(serverUrl, interactionId);
  }

  async initialize(): Promise<void> {
    console.log('[MCPPermissionStrategy] Initializing');
    
    // For now, we'll use direct permission flow
    // MCP server integration requires more complex setup with Claude Code SDK
    // TODO: Implement full MCP server integration when we can configure Claude Code SDK
    //       to connect to a custom MCP server
    
    console.log('[MCPPermissionStrategy] Using direct permission flow');
  }

  async requestPermission(request: PermissionRequest): Promise<boolean> {
    // With MCP, Claude Code will call the MCP server directly
    // This method might not be used, but we implement it as a fallback
    return this.requestPermissionViaUI(request);
  }

  private async requestPermissionViaUI(request: PermissionRequest): Promise<boolean> {
    try {
      // Request permission via our API
      const approved = await this.apiClient.requestToolPermission({
        toolName: request.toolCall.name,
        description: request.description || this.getToolDescription(request.toolCall.name)
      });

      console.log(`[MCPPermissionStrategy] Permission ${approved ? 'granted' : 'denied'} for ${request.toolCall.name}`);
      return approved;
    } catch (error) {
      console.error('[MCPPermissionStrategy] Error requesting permission:', error);
      return false;
    }
  }

  private getToolDescription(toolName: string): string {
    const descriptions: Record<string, string> = {
      'Read': 'Read the contents of a file',
      'Write': 'Write or modify a file',
      'Edit': 'Edit a file',
      'MultiEdit': 'Edit multiple sections of a file',
      'LS': 'List files in a directory',
      'Bash': 'Execute a shell command',
      'Grep': 'Search for patterns in files',
      'TodoWrite': 'Update your todo list',
      'WebSearch': 'Search the web for information',
      'WebFetch': 'Fetch content from a URL',
    };
    
    return descriptions[toolName] || `Execute ${toolName} tool`;
  }

  async cleanup(): Promise<void> {
    console.log('[MCPPermissionStrategy] Cleaning up');
    // No cleanup needed for direct permission flow
  }
}