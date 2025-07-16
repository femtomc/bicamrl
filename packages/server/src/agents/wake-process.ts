#!/usr/bin/env bun

/**
 * Wake Process V2 - Slim entry point using modular components
 * 
 * This script is spawned with:
 * - Working directory set to the appropriate worktree
 * - Interaction ID as command line argument
 * - Uses modular components for clean separation of concerns
 */

import { WakeProcessor } from '../process/wake/processor';

// Get interaction ID and server URL from environment/args
const interactionId = process.argv[2];
const serverUrl = process.env.BICAMRL_SERVER_URL || 'http://localhost:3456';

if (!interactionId) {
  console.error('[WakeProcess] No interaction ID provided');
  process.exit(1);
}

// Set up error handlers
process.on('uncaughtException', (error) => {
  console.error('[WakeProcess] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[WakeProcess] Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Create and start processor
const processor = new WakeProcessor(serverUrl, interactionId);

processor.start().catch((error) => {
  console.error('[WakeProcess] Fatal error:', error);
  process.exit(1);
});