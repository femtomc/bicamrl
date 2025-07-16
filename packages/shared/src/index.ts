// Shared types between server and TUI

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  interactionId?: string;
}

export interface Event {
  type: string;
  timestamp: Date;
  data: any;
}

export interface InteractionQueueStatus {
  queueSize: number;
  needsWork: number;
  needsReview: number;
  processing: number;
  completed: number;
  analyzing: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  id: string;
  output: string;
  error?: string;
}

// API Request/Response types
export interface SendMessageRequest {
  content: string;
  metadata?: Record<string, any>;
  worktreeId?: string;
  interactionId?: string; // For continuing existing conversations
}

export interface GetMessagesParams {
  limit?: number;
  offset?: number;
}

// SSE Event types
export interface SSEEvent {
  id?: string;
  event?: string;
  data: string;
}

export interface StreamingEvent {
  type: 'connected' | 'message' | 'streaming_start' | 'streaming_chunk' | 'streaming_end' | 
        'interaction_posted' | 'interaction_processing' | 'interaction_completed' | 
        'error' | 'ping';
  timestamp: Date;
  data: any;
}

// Worktree types
export interface Worktree {
  id: string;
  path: string;
  branch?: string;
  baseCommit?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
}

export interface CreateWorktreeRequest {
  branch?: string;
  baseBranch?: string;
  path?: string;
}

export interface WorktreeContext {
  worktreeId: string;
  worktreePath: string;
}