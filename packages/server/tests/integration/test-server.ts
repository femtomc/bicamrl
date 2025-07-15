import { serve } from 'bun';
import { execSync } from 'child_process';

export class TestServer {
  private server: any;
  private port: number;
  
  constructor(port: number = 3456) {
    this.port = port;
    // Set environment to use mock provider for tests
    process.env.DEFAULT_PROVIDER = 'mock';
    process.env.ENABLE_TOOLS = 'false';
  }
  
  async start(): Promise<void> {
    // Kill any existing process on the port
    try {
      execSync(`lsof -ti:${this.port} | xargs kill -9 2>/dev/null || true`);
    } catch (e) {
      // Ignore errors - port might not be in use
    }
    
    // Import app here to ensure environment is set first
    const app = await import('../../src/api/routes');
    
    // Start the server
    this.server = serve({
      port: this.port,
      fetch: app.default.fetch
    });
    
    // Wait for server to be ready
    await this.waitForServer();
  }
  
  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }
  
  private async waitForServer(maxAttempts: number = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`http://localhost:${this.port}/status`);
        if (response.ok) {
          return;
        }
      } catch (e) {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Server failed to start within timeout');
  }
  
  getUrl(path: string = ''): string {
    return `http://localhost:${this.port}${path}`;
  }
}