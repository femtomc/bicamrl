import { Hono } from 'hono';
import { cors } from 'hono/cors';
import createApp from './src/api/routes';

async function startServer() {
  const app = new Hono();
  
  // Middleware
  app.use('*', cors());
  
  // Mount routes
  const routes = await createApp;
  app.route('/api', routes);
  
  // Start server
  const port = process.env.PORT || 0; // 0 means use any available port
  
  const server = Bun.serve({
    port,
    fetch: app.fetch,
  });
  console.log(`Started development server: http://localhost:${server.port}`);
  
  // Write port to file for GUI to read (in project root)
  await Bun.write('../../.bicamrl-port', server.port!.toString());
  
  return server;
}

const server = await startServer();
export default server;