/**
 * Core agent abstractions for Bicamrl
 * 
 * These interfaces define how agents process interactions,
 * handle tool calls, and manage permissions.
 */

import type { Interaction } from '../interaction/types';
import type { Message } from '../message/types';
import type { ToolCall } from '../llm/service';

/**
 * Agent response after processing an interaction
 */
export interface AgentResponse {
  content: string;
  toolCalls?: ToolCall[];
  metadata?: {
    model?: string;
    usage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
    processingTimeMs?: number;
    toolsUsed?: string[];
  };
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Permission request for tool execution
 */
export interface PermissionRequest {
  toolCall: ToolCall;
  interactionId: string;
  description?: string;
}

/**
 * Strategy for handling tool permissions
 * Different providers need different permission flows
 */
export interface PermissionStrategy {
  /**
   * Initialize the permission strategy (e.g., start MCP server)
   */
  initialize?(): Promise<void>;

  /**
   * Request permission for a tool call
   */
  requestPermission(request: PermissionRequest): Promise<boolean>;

  /**
   * Cleanup resources (e.g., stop MCP server)
   */
  cleanup?(): Promise<void>;
}

/**
 * Core agent interface
 * All agents (Claude Code, LM Studio wrapped, etc.) implement this
 */
export interface Agent {
  /**
   * Unique identifier for this agent instance
   */
  id: string;

  /**
   * Process an interaction and generate a response
   */
  process(interaction: Interaction, messages: Message[]): Promise<AgentResponse>;

  /**
   * Handle a tool call (may use permission strategy)
   */
  handleToolCall?(call: ToolCall): Promise<ToolResult>;

  /**
   * Initialize the agent (e.g., setup MCP server for Claude Code)
   */
  initialize?(): Promise<void>;

  /**
   * Cleanup resources when done
   */
  cleanup?(): Promise<void>;
}

/**
 * Configuration for creating an agent
 */
export interface AgentConfig {
  provider: string;
  interactionId: string;
  worktreeContext?: any;
  options?: Record<string, any>;
}