/**
 * Structured metadata types for Interactions
 * Provides clear separation between permanent context, temporary processing state, and results
 */

import { TokenUsage } from './types';

/**
 * Permanent context that travels with the interaction
 */
export interface InteractionContext {
  worktreeId?: string;
  worktreePath?: string;
  branch?: string;
  sessionId?: string;
  environment?: Record<string, any>;
}

/**
 * Temporary state while processing
 * This should be cleared when processing completes
 */
export interface ProcessingState {
  currentAction?: string;
  startedAt?: Date;
  processor?: string;
  attemptNumber?: number;
}

/**
 * Permanent result metadata
 * Set when interaction completes successfully
 */
export interface ResultMetadata {
  model?: string;
  usage?: TokenUsage;
  processingTimeMs?: number;
  toolsUsed?: string[];
  completedAt?: Date;
}

/**
 * Structured metadata with clear separation of concerns
 */
export interface InteractionMetadata {
  // Permanent context
  context?: InteractionContext;
  
  // Temporary processing state
  processing?: ProcessingState;
  
  // Result metadata
  result?: ResultMetadata;
  
  // Tool permission state (temporary)
  permissionRequest?: {
    toolName: string;
    description: string;
    requestId: string;
    pendingToolCall: any;
  };
  
  // User permission response (temporary)
  permissionResponse?: boolean;
}

/**
 * Helper to clear temporary processing state
 */
export function clearProcessingState(metadata: InteractionMetadata): InteractionMetadata {
  const { processing, permissionRequest, permissionResponse, ...permanent } = metadata;
  return permanent;
}

/**
 * Helper to extract permanent metadata
 */
export function getPermanentMetadata(metadata: InteractionMetadata): InteractionMetadata {
  return {
    context: metadata.context,
    result: metadata.result
  };
}