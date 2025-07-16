import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { v4 as uuidv4 } from 'uuid';

/**
 * MCP Permission Server for Claude Code
 * 
 * This server intercepts tool calls from Claude Code and routes them
 * through our permission system before allowing/denying execution.
 */
export class MCPPermissionServer {
  private server: McpServer;
  private transport: StdioServerTransport;
  private serverUrl: string;
  private interactionId: string;

  constructor(interactionId: string, serverUrl: string) {
    this.interactionId = interactionId;
    this.serverUrl = serverUrl;
    
    this.server = new McpServer({
      name: "Bicamrl Permission Server",
      version: "1.0.0",
    });

    this.transport = new StdioServerTransport();
    this.setupApprovalTool();
  }

  private setupApprovalTool() {
    // Register the approval_prompt tool that Claude Code will call
    this.server.registerTool(
      "approval_prompt",
      {
        description: "Request permission to execute a tool",
        inputSchema: {
          tool_name: z.string().describe("The name of the tool requesting permission"),
          input: z.object({}).passthrough().describe("The input for the tool"),
          tool_use_id: z.string().optional().describe("The unique tool use request ID"),
        }
      },
      async ({ tool_name, input, tool_use_id }) => {
        console.log(`[MCPPermissionServer] Permission request for tool: ${tool_name}`);
        
        const requestId = tool_use_id || uuidv4();
        
        try {
          // Send permission request to our server
          const response = await fetch(`${this.serverUrl}/interactions/${this.interactionId}/permission`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toolName: tool_name,
              arguments: input,
              requestId,
              description: `Claude wants to use the ${tool_name} tool`
            })
          });

          if (!response.ok) {
            throw new Error(`Failed to create permission request: ${response.statusText}`);
          }

          // Wait for user approval/denial
          const permission = await this.waitForPermission(requestId);
          
          if (permission.approved) {
            console.log(`[MCPPermissionServer] Permission approved for ${tool_name}`);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    behavior: "allow",
                    updatedInput: input,
                  }),
                },
              ],
            };
          } else {
            console.log(`[MCPPermissionServer] Permission denied for ${tool_name}`);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    behavior: "deny",
                    message: "Permission denied by user",
                  }),
                },
              ],
            };
          }
        } catch (error) {
          console.error(`[MCPPermissionServer] Error handling permission request:`, error);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  behavior: "deny",
                  message: `Error: ${error.message}`,
                }),
              },
            ],
          };
        }
      }
    );
  }

  private async waitForPermission(requestId: string): Promise<{ approved: boolean }> {
    const maxWait = 60000; // 60 seconds
    const pollInterval = 500; // 500ms
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        const response = await fetch(`${this.serverUrl}/permissions/${requestId}/status`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'approved' || data.status === 'denied') {
            return { approved: data.status === 'approved' };
          }
        }
      } catch (error) {
        console.error(`[MCPPermissionServer] Error checking permission status:`, error);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout - default to deny
    console.warn(`[MCPPermissionServer] Permission request timed out for ${requestId}`);
    return { approved: false };
  }

  async start() {
    console.log(`[MCPPermissionServer] Starting for interaction ${this.interactionId}`);
    await this.server.connect(this.transport);
    console.log(`[MCPPermissionServer] Started successfully`);
  }

  async stop() {
    console.log(`[MCPPermissionServer] Stopping`);
    // The McpServer doesn't have a close method, but we can clean up the transport
    // Transport cleanup happens automatically when the process exits
  }
}

interface PermissionRequest {
  toolName: string;
  arguments: any;
  requestId: string;
}

interface PermissionResponse {
  approved: boolean;
  message?: string;
}