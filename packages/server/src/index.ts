import { serve } from 'bun';
import app from './api/routes';
import { writeFileSync } from 'fs';

const PORT = process.env.PORT || 3456;

const server = serve({
  port: PORT,
  fetch: app.fetch,
  // Increase timeout for SSE connections
  idleTimeout: 0 // No timeout for SSE
});

// Write port to file for GUI to discover
writeFileSync('../../.bicamrl-port', String(server.port));

console.log(`Server running on http://localhost:${server.port}`);
console.log('Available endpoints:');
console.log('  POST /message - Send a message');
console.log('  GET /status - Get queue status');
console.log('  GET /interactions - Get all interactions');
console.log('  GET /interactions/:id - Get single interaction');
console.log('  POST /interactions/:id/permission - Respond to permission request');
console.log('  GET /stream - SSE stream for real-time updates');
console.log('  POST /worktrees - Create a new worktree');
console.log('  GET /worktrees - List all worktrees');