#!/usr/bin/env bun

/**
 * MCP Permission Server Runner
 * 
 * This script runs the MCP permission server as a standalone process
 * that Claude Code SDK can connect to via stdio.
 */

import { MCPPermissionServer } from './mcp-permission-server.js';

async function main() {
  const interactionId = process.env.INTERACTION_ID;
  const serverUrl = process.env.SERVER_URL;

  if (!interactionId || !serverUrl) {
    console.error('[MCPRunner] Missing required environment variables');
    process.exit(1);
  }

  console.log(`[MCPRunner] Starting MCP server for interaction ${interactionId}`);

  try {
    const server = new MCPPermissionServer(interactionId, serverUrl);
    await server.start();

    // Keep the process alive
    process.on('SIGINT', async () => {
      console.log('[MCPRunner] Shutting down...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('[MCPRunner] Shutting down...');
      await server.stop();
      process.exit(0);
    });

    // Log that we're ready
    console.log('[MCPRunner] MCP server running');
  } catch (error) {
    console.error('[MCPRunner] Failed to start MCP server:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('[MCPRunner] Unhandled error:', error);
  process.exit(1);
});