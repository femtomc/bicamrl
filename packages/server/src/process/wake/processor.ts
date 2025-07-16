/**
 * Wake Processor V2 - Message-based processing
 * Handles conversations with multiple messages
 */

import { loadMindConfig } from '../../config/mind';
import { LLMService, MockLLMProvider } from '../../llm/service';
import { ClaudeCodeLLMProvider } from '../../llm/providers/claude-code';
import { ToolRegistry, ReadFileTool, WriteFileTool, ListDirectoryTool, BashTool, GrepTool } from '../../tools';
import { WakeApiClient } from './api-client';
import { SSEHandler } from './sse-handler';
import { ProgressReporter } from './progress-reporter';
import { ToolExecutor } from './tool-executor';
import type { Message } from '../../message/types';

export class WakeProcessor {
  private serverUrl: string;
  private apiClient: WakeApiClient;
  private sseHandler: SSEHandler;
  private progressReporter: ProgressReporter;
  private toolExecutor?: ToolExecutor;
  private llmService?: LLMService;
  
  private processedMessageIds = new Set<string>();
  private processingStartTime?: number;
  private toolsUsed: string[] = [];
  private isProcessing = false;
  
  constructor(
    serverUrl: string,
    private interactionId: string
  ) {
    // Use PORT from environment if serverUrl is localhost
    if (serverUrl.includes('localhost') && process.env.PORT) {
      this.serverUrl = `http://localhost:${process.env.PORT}`;
    } else {
      this.serverUrl = serverUrl;
    }
    this.apiClient = new WakeApiClient(this.serverUrl, interactionId);
    this.progressReporter = new ProgressReporter(
      (metadata) => this.apiClient.submitStatusUpdate(metadata)
    );
    this.sseHandler = new SSEHandler(
      this.serverUrl,
      interactionId,
      (event) => this.handleSSEEvent(event)
    );
  }

  async start(): Promise<void> {
    console.log(`[WakeProcessor] Starting for interaction ${this.interactionId}`);
    console.log(`[WakeProcessor] Working directory: ${process.cwd()}`);
    
    try {
      // Initialize services
      await this.initializeServices();
      
      // Connect to SSE stream
      await this.sseHandler.connect();
      
      // Load initial messages and process pending ones
      await this.loadAndProcessMessages();
      
      console.log('[WakeProcessor] Ready and listening for messages');
    } catch (error) {
      console.error('[WakeProcessor] Failed to start:', error);
      process.exit(1);
    }
  }

  private async initializeServices(): Promise<void> {
    // Initialize LLM
    const mindConfig = loadMindConfig();
    this.llmService = new LLMService(mindConfig.default_provider);
    this.llmService.registerProvider('mock', new MockLLMProvider());
    this.llmService.registerProvider('claude_code', new ClaudeCodeLLMProvider());
    
    // Initialize tools if enabled
    const enableTools = process.env.ENABLE_TOOLS === 'true';
    if (enableTools) {
      console.log('[WakeProcessor] Tools enabled, initializing...');
      const toolRegistry = new ToolRegistry();
      toolRegistry.register(new ReadFileTool());
      toolRegistry.register(new WriteFileTool());
      toolRegistry.register(new ListDirectoryTool());
      toolRegistry.register(new BashTool());
      toolRegistry.register(new GrepTool());
      
      this.toolExecutor = new ToolExecutor(
        toolRegistry,
        (request) => this.apiClient.requestToolPermission(request)
      );
    }
  }

  private async loadAndProcessMessages(): Promise<void> {
    // Get conversation from server
    const conversation = await this.apiClient.getConversation();
    if (!conversation) {
      console.error('[WakeProcessor] Conversation not found');
      return;
    }

    // Process any pending user messages
    const pendingMessages = conversation.messages.filter(
      (msg: any) => msg.role === 'user' && msg.status === 'pending'
    );

    for (const message of pendingMessages) {
      if (!this.processedMessageIds.has(message.id)) {
        await this.processMessage(message);
      }
    }
  }

  private async handleSSEEvent(event: any): Promise<void> {
    if (event.type === 'message:added' && event.data.message.role === 'user') {
      const message = event.data.message;
      if (!this.processedMessageIds.has(message.id)) {
        await this.processMessage(message);
      }
    }
  }

  private async processMessage(message: Message): Promise<void> {
    if (this.isProcessing) {
      console.log('[WakeProcessor] Already processing, queuing message', message.id);
      return;
    }

    this.isProcessing = true;
    this.processedMessageIds.add(message.id);
    this.processingStartTime = Date.now();
    
    console.log(`[WakeProcessor] Processing message ${message.id}: "${message.content}"`);
    
    try {
      // Update message status
      await this.apiClient.updateMessageStatus(message.id, 'processing');
      
      // Start progress reporting
      this.progressReporter.start();
      
      // Get full conversation history
      const conversation = await this.apiClient.getConversation();
      const messages = conversation.messages
        .filter((m: any) => m.role !== 'system' || m.metadata?.permissionRequest)
        .map((m: any) => ({
          role: m.role,
          content: m.content
        }));
      
      // Process with LLM
      const tools = this.toolExecutor?.getAvailableTools() || [];
      let result = await this.llmService!.completeWithTools(
        messages,
        tools
      );
      
      // Handle tool calls if any
      if (result.toolCalls && result.toolCalls.length > 0 && this.toolExecutor) {
        const toolResults = [];
        
        for (const toolCall of result.toolCalls) {
          this.toolsUsed.push(toolCall.name);
          this.progressReporter.updateToolsUsed(this.toolsUsed);
          
          const toolResult = await this.toolExecutor.execute(toolCall);
          toolResults.push({
            toolCall,
            result: toolResult
          });
        }
        
        // If tools were executed, we need to make another LLM call with the results
        // Add tool results to the conversation
        const messagesWithTools = [...messages];
        
        // Add assistant message with tool calls
        messagesWithTools.push({
          role: 'assistant',
          content: result.content || 'I need to use a tool to help with this.'
        });
        
        // Add tool results as user messages
        for (const { toolCall, result: toolResult } of toolResults) {
          if (toolResult.success) {
            messagesWithTools.push({
              role: 'user',
              content: `Tool result for ${toolCall.name}: ${toolResult.result}`
            });
          } else {
            messagesWithTools.push({
              role: 'user',
              content: `Tool error for ${toolCall.name}: ${toolResult.error}`
            });
          }
        }
        
        // Make another LLM call with the tool results
        result = await this.llmService!.completeWithTools(
          messagesWithTools,
          [] // No tools for the follow-up call
        );
      }
      
      // Stop progress reporting
      this.progressReporter.stop();
      
      // Submit assistant response
      const processingTime = Date.now() - this.processingStartTime;
      await this.apiClient.submitAssistantResponse(result.content, {
        processingTimeMs: processingTime,
        usage: result.usage,
        toolsUsed: this.toolsUsed
      });
      
      // Update message status
      await this.apiClient.updateMessageStatus(message.id, 'completed');
      
      console.log('[WakeProcessor] Message processed successfully');
      
    } catch (error) {
      console.error('[WakeProcessor] Error processing message:', error);
      this.progressReporter.stop();
      
      // Update message status
      await this.apiClient.updateMessageStatus(message.id, 'failed');
      
      // Submit error response
      await this.apiClient.submitAssistantResponse(
        `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error: true }
      );
    } finally {
      this.isProcessing = false;
      this.toolsUsed = [];
    }
  }

  async stop(): Promise<void> {
    console.log('[WakeProcessor] Stopping...');
    this.progressReporter.stop();
    await this.sseHandler.disconnect();
  }
}