import { serve } from 'bun';
import createApp from './api/routes';
import { writeFileSync } from 'fs';

const PORT = process.env.PORT || 3456;

async function startServer() {
  try {
    // Create app with all services initialized
    const app = await createApp;
    
    const server = serve({
      port: PORT,
      fetch: app.fetch,
      // Increase timeout for SSE connections
      idleTimeout: 0 // No timeout for SSE
    });
    
    // Write port to file for GUI to discover
    writeFileSync('../../.bicamrl-port', String(server.port));
    
    console.log(`Server running on http://localhost:${server.port}`);
    console.log('\nAvailable endpoints:');
    console.log('  Health & Monitoring:');
    console.log('    GET  /health                    - Basic health check');
    console.log('    GET  /monitoring/health          - Detailed health status');
    console.log('    GET  /monitoring/processes       - List all Wake processes');
    console.log('    GET  /monitoring/processes/:id   - Get process details');
    console.log('    GET  /monitoring/metrics         - System metrics');
    console.log('');
    console.log('  Interactions:');
    console.log('    POST /message                    - Send a message');
    console.log('    GET  /interactions               - Get all interactions');
    console.log('    GET  /interactions/:id           - Get single interaction');
    console.log('    POST /interactions/:id/result    - Submit result (internal)');
    console.log('    GET  /stream                     - SSE stream for updates');
    console.log('');
    console.log('  Worktrees:');
    console.log('    GET  /worktrees                  - List all worktrees');
    console.log('    POST /worktrees                  - Create a new worktree');
    console.log('\nPress Ctrl+C to stop the server');
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();