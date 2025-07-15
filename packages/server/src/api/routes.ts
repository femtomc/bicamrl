import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { InteractionBus } from '../interaction/bus';
import { WakeAgent } from '../agents/wake';
import { LLMService, MockLLMProvider } from '../llm/service';
import { ClaudeCodeLLMProvider } from '../llm/providers/claude-code';
import { Interaction, InteractionType } from '../interaction/types';
import { loadMindConfig } from '../config/mind';
import { WorktreeManager } from '../worktree/manager';
import { InMemoryWorktreeStore } from '../worktree/memory-store';
import type { SendMessageRequest } from '@bicamrl/shared';

const app = new Hono();

// Middleware
app.use('*', cors());

// Load configuration
const mindConfig = loadMindConfig();

// Single global instance
const llmService = new LLMService(mindConfig.default_provider);
llmService.registerProvider('mock', new MockLLMProvider());
llmService.registerProvider('claude_code', new ClaudeCodeLLMProvider());
const interactionBus = new InteractionBus();

// Initialize worktree manager
const worktreeStore = new InMemoryWorktreeStore();
const worktreeManager = new WorktreeManager(process.cwd(), worktreeStore);

// Initialize manager
worktreeManager.initialize().catch(err => console.error('Worktree manager init failed:', err));

// Enable tools based on Mind.toml configuration
const enableTools = mindConfig.agents?.enable_tools ?? false;
console.log(`[Config] Tools enabled: ${enableTools}`);
const wakeAgent = new WakeAgent(interactionBus, llmService, enableTools);

// Start the agent
wakeAgent.run().catch(err => console.error('Wake agent failed:', err));

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// Send a message
app.post('/message', async (c) => {
  console.log('[API] Received message request');
  const { content, metadata, worktreeId } = await c.req.json<SendMessageRequest>();
  
  if (!content) {
    console.log('[API] No content provided');
    return c.json({ error: 'No content provided' }, 400);
  }
  
  // Build worktree context if worktreeId provided
  let worktreeContext = undefined;
  if (worktreeId) {
    const worktree = await worktreeManager.getWorktree(worktreeId);
    if (worktree) {
      worktreeContext = {
        worktreeId: worktree.id,
        worktreePath: worktree.path
      };
    }
  }
  
  // Check if there's an interaction waiting for permission
  const interactions = interactionBus.getAllInteractions();
  const waitingInteraction = interactions.find(i => 
    i.metadata?.status === 'waiting_for_permission'
  );
  
  console.log('[API] Checking for waiting interactions. Found:', interactions.length, 'total');
  console.log('[API] Waiting interaction:', waitingInteraction?.id || 'none');
  
  if (waitingInteraction) {
    console.log('[API] Found interaction waiting for permission:', waitingInteraction.id);
    
    // Check if this looks like a permission response
    const lowerContent = content.toLowerCase();
    const permissionWords = ['yes', 'no', 'approve', 'deny', 'proceed', 'go ahead', 'don\'t', 'stop'];
    const isPermissionResponse = permissionWords.some(word => lowerContent.includes(word)) && 
                                 content.length < 50; // Short responses are more likely permission responses
    
    if (isPermissionResponse) {
      console.log('[API] Detected permission response, adding to existing interaction');
      // Add the response to the existing interaction
      await interactionBus.addMessageToInteraction(waitingInteraction.id, {
        role: 'user',
        content: content,
        timestamp: new Date()
      });
      
      return c.json({ id: waitingInteraction.id, status: 'queued' });
    } else {
      console.log('[API] Not a permission response, creating new interaction');
    }
  }
  
  // Otherwise create a new interaction
  console.log('[API] Creating new interaction with content:', content);
  const interaction = Interaction.create({
    source: 'user',
    type: InteractionType.QUERY,
    initialMessage: content
  }).withMetadata({
    ...metadata,
    worktreeContext
  });
  
  console.log('[API] Posting interaction to bus');
  const id = await interactionBus.post(interaction);
  
  console.log('[API] Interaction queued with id:', id);
  return c.json({ id, status: 'queued' });
});

// Get queue status
app.get('/status', async (c) => {
  const stats = interactionBus.getQueueStats();
  return c.json(stats);
});

// Get all interactions
app.get('/interactions', async (c) => {
  const interactions = interactionBus.getAllInteractions();
  return c.json(interactions);
});

// Get single interaction
app.get('/interactions/:id', async (c) => {
  const { id } = c.req.param();
  const interactions = interactionBus.getAllInteractions();
  const interaction = interactions.find(i => i.id === id);
  
  if (!interaction) {
    return c.json({ error: 'Interaction not found' }, 404);
  }
  
  return c.json(interaction);
});

// Respond to permission request
app.post('/interactions/:id/permission', async (c) => {
  const { id } = c.req.param();
  const { approved } = await c.req.json();
  
  console.log(`[API] Permission response for ${id}: ${approved ? 'approved' : 'denied'}`);
  
  // Get the interaction
  const interactions = interactionBus.getAllInteractions();
  const interaction = interactions.find(i => i.id === id);
  
  if (!interaction) {
    return c.json({ error: 'Interaction not found' }, 404);
  }
  
  if (interaction.status !== 'waiting_for_permission') {
    return c.json({ error: 'Interaction not waiting for permission' }, 400);
  }
  
  // Update the interaction with permission response
  await interactionBus.respondToPermission(id, approved);
  
  return c.json({ success: true });
});

// Worktree endpoints
app.get('/worktrees', async (c) => {
  const worktrees = await worktreeManager.listWorktrees();
  return c.json(worktrees);
});

app.post('/worktrees', async (c) => {
  const { branch, baseBranch, path } = await c.req.json();
  
  try {
    const worktree = await worktreeManager.createWorktree(branch, baseBranch, path);
    return c.json(worktree);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

app.delete('/worktrees/:id', async (c) => {
  const { id } = c.req.param();
  
  try {
    await worktreeManager.deleteWorktree(id);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// SSE endpoint for real-time updates
app.get('/stream', async (c) => {
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection
      controller.enqueue(`data: ${JSON.stringify({ connected: true })}\n\n`);
      
      // Subscribe to events
      const unsubscribe = interactionBus.subscribe((event) => {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      });
      
      // Send keep-alive every 30 seconds
      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(`:keepalive\n\n`);
        } catch (e) {
          // Stream might be closed
          clearInterval(keepAliveInterval);
        }
      }, 30000);
      
      // Handle client disconnect
      c.req.raw.signal.addEventListener('abort', () => {
        clearInterval(keepAliveInterval);
        unsubscribe();
        controller.close();
      });
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
});

export default app;