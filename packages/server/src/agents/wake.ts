import { Agent } from '../core/agent';
import { Interaction, InteractionType } from '../interaction/types';
import type { ToolPermissionRequest, ToolPermissionResponse, ConversationItem } from '../interaction/types';
import { InteractionBus } from '../interaction/bus';
import { LLMService } from '../llm/service';
import { ToolRegistry, ReadFileTool, WriteFileTool, ListDirectoryTool } from '../tools';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * WakeAgent - Simple agent that passes user queries to Claude
 */
export class WakeAgent extends Agent {
  private toolRegistry: ToolRegistry;
  private enableTools: boolean;
  
  constructor(
    interactionBus: InteractionBus,
    llmService: LLMService,
    enableTools: boolean = false
  ) {
    super('wake', interactionBus, llmService);
    
    this.enableTools = enableTools;
    
    // Initialize tool registry
    this.toolRegistry = new ToolRegistry();
    
    // Register built-in tools if enabled
    if (enableTools) {
      this.toolRegistry.register(new ReadFileTool());
      this.toolRegistry.register(new WriteFileTool());
      this.toolRegistry.register(new ListDirectoryTool());
      console.log('[Wake] Tools enabled:', this.toolRegistry.getTools().map(t => t.name));
    }
  }

  interestedInTypes(): InteractionType[] {
    return [InteractionType.QUERY, InteractionType.ACTION];
  }


  public isRelevantInteraction(interaction: Interaction): boolean {
    // If interaction is locked and not for us, skip it
    if (interaction.lockedFor && interaction.lockedFor !== this.agentId) {
      console.log(`[Wake] Skipping interaction ${interaction.id} - locked for ${interaction.lockedFor}`);
      return false;
    }
    
    // Process queries/actions from users
    if (interaction.source === 'user') {
      // If waiting for permission, only process if there's a permission response
      if (interaction.metadata?.status === 'waiting_for_permission') {
        return interaction.metadata?.permissionResponse !== undefined;
      }
      
      // Otherwise, only process if we haven't already processed it
      const alreadyProcessed = interaction.content?.some(
        msg => msg.role === 'assistant' && msg.metadata?.agentId === this.agentId
      ) || false;
      
      return !alreadyProcessed;
    }
    return false;
  }

  async processInteraction(interaction: Interaction): Promise<{
    response: string;
    model?: string;
    usage?: any;
    metadata?: any;
  }> {
    const query = interaction.getInitialQuery();
    if (!query) {
      throw new Error('No query found in interaction');
    }
    
    // Set worktree context for tools if available
    if (interaction.metadata?.worktreeContext) {
      this.toolRegistry.setWorktreeContext(interaction.metadata.worktreeContext);
      console.log('[Wake] Set worktree context:', interaction.metadata.worktreeContext.worktreePath);
    }
    
    // Simple check: if we're already waiting for permission, see if user responded
    if (interaction.metadata?.status === 'waiting_for_permission' && 
        interaction.metadata?.permissionResponse !== undefined) {
      const approved = interaction.metadata.permissionResponse;
      console.log('[Wake] Processing permission response:', approved ? 'approved' : 'denied');
      
      if (approved && interaction.metadata?.pendingToolCall) {
        // Execute the tool
        const toolCall = interaction.metadata.pendingToolCall;
        console.log('[Wake] User approved, executing tool:', toolCall);
        
        // Update status to show tool execution
        interaction.metadata.currentAction = `⚙️ Executing ${toolCall.name} tool...`;
        await this.interactionBus.emitEvent({
          type: 'interaction_updated',
          timestamp: new Date(),
          data: {
            interactionId: interaction.id,
            metadata: interaction.metadata
          }
        });
        
        const toolResult = await this.executeTool(toolCall.name, toolCall.arguments);
        console.log('[Wake] Tool result:', toolResult);
        
        // Add tool result to messages and get final response
        const messages = this.buildMessages(interaction, toolResult);
        const tools = this.enableTools ? this.toolRegistry.getTools() : [];
        
        // Update status to show we're generating response
        interaction.metadata.currentAction = '🤔 Processing tool results...';
        await this.interactionBus.emitEvent({
          type: 'interaction_updated',
          timestamp: new Date(),
          data: {
            interactionId: interaction.id,
            metadata: interaction.metadata
          }
        });
        
        const response = await this.llmService.completeWithTools(messages, tools);
        
        // Clear progress indicator
        delete interaction.metadata.currentAction;
        
        // Note: interaction is immutable, metadata updates happen in the return value
        
        return {
          response: response.content,
          model: response.model,
          usage: response.usage,
          metadata: { status: 'completed' }
        };
      } else {
        // User denied or no pending tool
        // Return result - metadata updates happen through return value
        return {
          response: "I understand. I won't use that tool. Is there anything else I can help you with?",
          metadata: { status: 'completed' }
        };
      }
    }
    
    // Normal query processing
    console.log('[Wake] Processing interaction:', interaction.id);
    console.log('[Wake] Query:', query);
    
    const startTime = Date.now();
    
    // Build conversation from content array
    const messages = interaction.content.map(item => ({
      role: item.role as 'user' | 'assistant' | 'system',
      content: item.content
    }));
    
    // Update metadata to show we're processing
    interaction.metadata.status = 'processing';
    interaction.metadata.currentAction = 'Initializing LLM...';
    
    await this.interactionBus.emitEvent({
      type: 'interaction_updated',
      timestamp: new Date(),
      data: {
        interactionId: interaction.id,
        metadata: interaction.metadata
      }
    });
    
    console.log('[Wake] Sending to LLM with messages:', messages);
    
    // Get available tools
    const tools = this.toolRegistry.getTools();
    
    // Use Unicode mathematical operators from U+2295 to U+22A1
    const symbols = [
      '⊕', '⊖', '⊗', '⊘', '⊙', '⊚', '⊛', '⊜', '⊝', '⊞', '⊟',
      '⊠', '⊡'
    ];
    let symbolIndex = 0;
    
    // Track real tokens from LLM
    let realOutputTokens = 0;
    let lastTokenUpdate = Date.now();
    
    // Progress update interval
    const progressInterval = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      const seconds = (elapsed / 1000).toFixed(1);
      
      // Rotate through symbols
      symbolIndex = (symbolIndex + 1) % symbols.length;
      const symbol = symbols[symbolIndex];
      
      // Determine action text based on elapsed time and token generation
      let actionText = 'Processing';
      if (elapsed < 500) {
        actionText = 'Initializing';
      } else if (realOutputTokens === 0 && elapsed < 2000) {
        actionText = 'Analyzing request';
      } else if (realOutputTokens > 0) {
        const timeSinceLastToken = Date.now() - lastTokenUpdate;
        if (timeSinceLastToken < 100) {
          actionText = 'Generating response';
        } else if (timeSinceLastToken < 500) {
          actionText = 'Thinking';
        } else {
          actionText = 'Processing';
        }
      } else {
        actionText = 'Waiting for LLM';
      }
      
      // Update progress with real token count
      interaction.metadata.currentAction = `${symbol} ${actionText} • ${seconds}s • ${realOutputTokens} tokens`;
      
      await this.interactionBus.emitEvent({
        type: 'interaction_updated',
        timestamp: new Date(),
        data: {
          interactionId: interaction.id,
          metadata: interaction.metadata
        }
      });
    }, 100); // Update 10 times per second for smoother animation
    
    let response;
    try {
      console.log('[Wake] Calling LLM with tools:', tools.map(t => t.name));
      
      // Call LLM with token update callback
      response = await this.llmService.completeWithTools(messages, tools, {
        onTokenUpdate: async (tokens: number) => {
          realOutputTokens = tokens;
          lastTokenUpdate = Date.now();
          
          // Update token count in metadata
          interaction.metadata.tokens = {
            ...interaction.metadata.tokens,
            output: tokens
          };
        }
      });
      
      console.log('[Wake] Got response:', response);
    } finally {
      clearInterval(progressInterval);
      
      // Clear the currentAction from metadata
      delete interaction.metadata.currentAction;
    }
    
    // Handle tool calls if any
    if (response.toolCalls && response.toolCalls.length > 0) {
      console.log('[Wake] LLM wants to use tools:', response.toolCalls);
      
      // For now, just handle the first tool call
      const toolCall = response.toolCalls[0];
      if (!toolCall) {
        throw new Error('Tool call array is empty');
      }
      
      // Create a permission request
      const permissionRequest: ToolPermissionRequest = {
        toolName: toolCall.name,
        description: this.getToolDescription(toolCall.name),
        arguments: toolCall.arguments,
        requestId: toolCall.id
      };
      
      // Store the permission request in metadata
      interaction.metadata.toolPermission = permissionRequest;
      
      // Calculate processing time
      const processingTimeMs = Date.now() - startTime;
      
      // Update interaction with partial result
      if (response.usage) {
        interaction.metadata.tokens = {
          input: response.usage.inputTokens,
          output: response.usage.outputTokens,
          total: response.usage.totalTokens
        };
      }
      
      interaction.metadata.model = response.model;
      interaction.metadata.processingTimeMs = processingTimeMs;
      interaction.metadata.status = 'waiting_for_permission';
      interaction.metadata.pendingToolCall = toolCall;  // Store the tool call for later
      // Clear progress indicator
      delete interaction.metadata.currentAction;
      
      // Return a message asking for permission
      return {
        response: `I'd like to use the ${toolCall.name} tool to help with your request. This tool ${this.getToolDescription(toolCall.name)}.\n\nMay I proceed?`,
        model: response.model,
        usage: response.usage,
        metadata: interaction.metadata
      };
    }
    
    // No tool calls, return the response
    const processingTimeMs = Date.now() - startTime;
    
    // Update interaction with final token usage
    if (response.usage) {
      interaction.metadata.tokens = {
        input: response.usage.inputTokens,
        output: response.usage.outputTokens,
        total: response.usage.totalTokens
      };
    }
    
    interaction.metadata.model = response.model;
    interaction.metadata.processingTimeMs = processingTimeMs;
    interaction.metadata.status = 'completed';
    // Clear progress indicator
    delete interaction.metadata.currentAction;
    
    return {
      response: response.content,
      model: response.model,
      usage: response.usage,
      metadata: interaction.metadata
    };
  }

  
  getRegisteredTools() {
    return this.toolRegistry.getTools();
  }
  
  private async executeTool(toolName: string, args: any): Promise<any> {
    // Map Claude Code tool names to our tool names
    const toolNameMap: Record<string, string> = {
      'Read': 'read_file',
      'Write': 'write_file',
      'LS': 'list_directory'
    };
    
    const mappedName = toolNameMap[toolName] || toolName;
    const tool = this.toolRegistry.getTool(mappedName);
    if (!tool) {
      throw new Error(`Tool ${toolName} (mapped to ${mappedName}) not found`);
    }
    
    // Map Claude Code arguments to our tool arguments
    const mappedArgs = toolName === 'Read' ? { path: args.file_path } : args;
    
    return await tool.execute(mappedArgs);
  }
  
  private buildMessages(interaction: Interaction, toolResult?: any): any[] {
    const messages = [];
    
    // Add all conversation messages
    for (const msg of interaction.content) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
    
    // If we have a tool result, add it
    if (toolResult && interaction.metadata?.pendingToolCall) {
      messages.push({
        role: 'tool',
        content: JSON.stringify(toolResult),
        tool_use_id: interaction.metadata.pendingToolCall.id
      });
    }
    
    return messages;
  }
  
  private getToolDescription(toolName: string): string {
    // Map Claude Code tool names to our tool names
    const toolNameMap: Record<string, string> = {
      'Read': 'read_file',
      'Write': 'write_file',
      'LS': 'list_directory'
    };
    
    const mappedName = toolNameMap[toolName] || toolName;
    const tool = this.toolRegistry.getTool(mappedName);
    const description = tool?.description || 'performs an action';
    console.log(`[Wake] Tool description for ${toolName} -> ${mappedName}: ${description}`);
    return description;
  }
  
  private getLastUserMessage(interaction: Interaction): ConversationItem | null {
    for (let i = interaction.content.length - 1; i >= 0; i--) {
      const msg = interaction.content[i];
      if (msg && msg.role === 'user') {
        return msg as ConversationItem;
      }
    }
    return null;
  }
  
  private parsePermissionResponse(content: string): boolean {
    const lowerContent = content.toLowerCase();
    // Look for affirmative responses
    const affirmatives = ['yes', 'yeah', 'sure', 'ok', 'okay', 'proceed', 'go ahead', 'continue', 'approve'];
    return affirmatives.some(word => lowerContent.includes(word));
  }
  
  private async continueWithToolExecution(interaction: Interaction, permissionRequest: ToolPermissionRequest): Promise<any> {
    console.log('[Wake] Continuing with approved tool execution:', permissionRequest.toolName);
    
    try {
      // Execute the tool
      const toolResult = await this.toolRegistry.executeWithPermission(
        permissionRequest.toolName,
        permissionRequest.arguments,
        permissionRequest.requestId
      );
      
      console.log('[Wake] Tool execution result:', toolResult);
      
      // Add tool result to conversation
      const toolResponse = {
        role: 'tool' as const,
        content: JSON.stringify(toolResult),
        toolUseId: permissionRequest.requestId
      };
      
      // Build updated conversation
      const messages = [
        ...interaction.content.map(item => ({
          role: item.role as 'user' | 'assistant' | 'system',
          content: item.content
        })),
        toolResponse
      ];
      
      // Get final response from LLM with tool result
      console.log('[Wake] Getting final response after tool execution');
      const response = await this.llmService.completeWithTools(messages, []);
      
      return {
        response: response.content,
        model: response.model,
        usage: response.usage,
        metadata: {
          status: 'completed',
          toolsUsed: [permissionRequest.toolName]
        }
      };
    } catch (error) {
      console.error('[Wake] Tool execution error:', error);
      return {
        response: `I encountered an error while using the ${permissionRequest.toolName} tool: ${error}`,
        metadata: { status: 'error', error: String(error) }
      };
    }
  }
}