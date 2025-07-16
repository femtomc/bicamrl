/**
 * Wake Processor V2 - Message-based processing
 * Handles conversations with multiple messages
 * 
 * Now uses the Agent abstraction for all LLM interactions
 */

import { loadMindConfig } from '../../config/mind';
import { createAgent } from '../../agents/factory';
import type { Agent } from '../../agents/types';
import { WakeApiClient } from './api-client';
import { SSEHandler } from './sse-handler';
import { ProgressReporter } from './progress-reporter';
import type { Message } from '../../message/types';

export class WakeProcessor {
  private serverUrl: string;
  private apiClient: WakeApiClient;
  private sseHandler: SSEHandler;
  private progressReporter: ProgressReporter;
  private agent?: Agent;
  
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
    // Initialize agent based on configured provider
    const mindConfig = loadMindConfig();
    const provider = mindConfig.default_provider;
    
    console.log(`[WakeProcessor] Creating agent for provider: ${provider}`);
    
    this.agent = await createAgent({
      provider,
      interactionId: this.interactionId,
      serverUrl: this.serverUrl,
      config: mindConfig.llm_providers?.[provider]
    });
    
    console.log('[WakeProcessor] Agent initialized successfully');
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
      const interaction = conversation; // In new architecture, conversation IS the interaction
      
      // Process with agent
      const agentResponse = await this.agent!.process(interaction, conversation.messages);
      
      // Track tools used
      if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
        this.toolsUsed = agentResponse.metadata?.toolsUsed || [];
        this.progressReporter.updateToolsUsed(this.toolsUsed);
      }
      
      // Stop progress reporting
      this.progressReporter.stop();
      
      // Submit assistant response
      const processingTime = Date.now() - this.processingStartTime;
      await this.apiClient.submitAssistantResponse(agentResponse.content, {
        processingTimeMs: processingTime,
        usage: agentResponse.metadata?.usage,
        toolsUsed: this.toolsUsed,
        model: agentResponse.metadata?.model
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
    
    if (this.agent && this.agent.cleanup) {
      await this.agent.cleanup();
    }
  }
}