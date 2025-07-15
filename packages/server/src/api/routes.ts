import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { InteractionStore } from '../interaction/store';
import { WakeProcessor } from '../agents/wake-processor';
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

// Initialize services
const llmService = new LLMService(mindConfig.default_provider);
llmService.registerProvider('mock', new MockLLMProvider());
llmService.registerProvider('claude_code', new ClaudeCodeLLMProvider());

// Initialize interaction store
const interactionStore = new InteractionStore();

// Initialize worktree manager
const worktreeStore = new InMemoryWorktreeStore();
const repoRoot = process.env.BICAMRL_REPO_ROOT || process.cwd();
const worktreeManager = new WorktreeManager(repoRoot, worktreeStore);

// Initialize manager
worktreeManager.initialize()
  .then(() => console.log('[WorktreeManager] Initialized successfully'))
  .catch(err => console.error('[WorktreeManager] Init failed:', err));

// Enable tools based on Mind.toml configuration
const enableTools = mindConfig.agents?.enable_tools ?? false;
console.log(`[Config] Tools enabled: ${enableTools}`);

// Start the wake processor
const wakeProcessor = new WakeProcessor(interactionStore, llmService, enableTools);
wakeProcessor.start().catch(err => console.error('Wake processor failed:', err));

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
  const interactions = interactionStore.getAll();
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
      await interactionStore.addMessage(waitingInteraction.id, {
        role: 'user',
        content: content,
        timestamp: new Date()
      });
      
      // Update metadata with permission response
      const approved = lowerContent.includes('yes') || lowerContent.includes('approve');
      await interactionStore.updateMetadata(waitingInteraction.id, {
        permissionResponse: approved
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
  
  console.log('[API] Posting interaction to store');
  const id = await interactionStore.create(interaction);
  
  console.log('[API] Interaction created with id:', id);
  return c.json({ id, status: 'queued' });
});

// Get queue status
app.get('/status', async (c) => {
  const interactions = interactionStore.getAll();
  let processing = 0;
  let completed = 0;
  let queued = 0;
  
  for (const interaction of interactions) {
    switch (interaction.state.kind) {
      case 'processing':
      case 'waiting_permission':
        processing++;
        break;
      case 'completed':
      case 'failed':
        completed++;
        break;
      case 'queued':
        queued++;
        break;
    }
  }
  
  return c.json({
    queueSize: queued,
    processing,
    completed
  });
});

// Get all interactions
app.get('/interactions', async (c) => {
  const interactions = interactionStore.getAllSerialized();
  return c.json(interactions);
});

// Get single interaction
app.get('/interactions/:id', async (c) => {
  const { id } = c.req.param();
  const interaction = interactionStore.get(id);
  
  if (!interaction) {
    return c.json({ error: 'Interaction not found' }, 404);
  }
  
  // Serialize for API response
  const serialized = interactionStore.getAllSerialized().find(i => i.id === id);
  return c.json(serialized);
});

// Respond to permission request
app.post('/interactions/:id/permission', async (c) => {
  const { id } = c.req.param();
  const { approved } = await c.req.json();
  
  console.log(`[API] Permission response for ${id}: ${approved ? 'approved' : 'denied'}`);
  
  // Get the interaction
  const interaction = interactionStore.get(id);
  
  if (!interaction) {
    return c.json({ error: 'Interaction not found' }, 404);
  }
  
  if (interaction.metadata?.status !== 'waiting_for_permission') {
    return c.json({ error: 'Interaction not waiting for permission' }, 400);
  }
  
  // Update the interaction with permission response
  await interactionStore.updateMetadata(id, {
    permissionResponse: approved
  });
  
  return c.json({ success: true });
});

// Submit result for an interaction (used by Wake processes)
app.post('/interactions/:id/result', async (c) => {
  const { id } = c.req.param();
  const result = await c.req.json();
  
  console.log(`[API] Result submission for ${id}`);
  
  // Get the interaction
  const interaction = interactionStore.get(id);
  
  if (!interaction) {
    return c.json({ error: 'Interaction not found' }, 404);
  }
  
  // Add assistant message if there's a response
  if (result.response) {
    await interactionStore.addMessage(id, {
      role: 'assistant',
      content: result.response,
      timestamp: new Date(),
      metadata: { model: result.model }
    });
  }
  
  // Update metadata
  const metadata = {
    ...result.metadata,
    ...(result.usage && {
      tokens: {
        input: result.usage.inputTokens || 0,
        output: result.usage.outputTokens || 0,
        total: result.usage.totalTokens || 0
      }
    }),
    ...(result.model && { model: result.model }),
    processingTimeMs: Date.now() - interaction.timestamp.getTime()
  };
  
  await interactionStore.updateMetadata(id, metadata);
  
  // Update state based on status
  if (result.metadata?.status === 'waiting_for_permission') {
    // Update to waiting_permission state
    await interactionStore.update(id, interaction =>
      interaction.withState({
        kind: 'waiting_permission',
        tool: metadata.pendingToolCall?.name || '',
        requestId: metadata.pendingToolCall?.id || '',
        processor: 'wake'
      })
    );
  } else if (result.metadata?.status !== 'waiting_for_permission') {
    await interactionStore.complete(id, result);
  }
  
  return c.json({ success: true });
});

// Close an interaction
app.post('/interactions/:id/close', async (c) => {
  const { id } = c.req.param();
  const { feedback } = await c.req.json();
  
  console.log(`[API] Closing interaction ${id}`);
  
  // Mark as completed with feedback
  await interactionStore.complete(id, { feedback });
  
  return c.json({ success: true });
});

// Worktree endpoints
app.get('/worktrees', async (c) => {
  console.log('[API] GET /worktrees request');
  try {
    const worktrees = await worktreeManager.listWorktrees();
    console.log('[API] Found worktrees:', worktrees.length);
    return c.json(worktrees);
  } catch (error: any) {
    console.error('[API] Error listing worktrees:', error);
    return c.json({ error: error.message }, 500);
  }
});

app.post('/worktrees', async (c) => {
  console.log('[API] POST /worktrees request received');
  const { branch, baseBranch, path } = await c.req.json();
  console.log('[API] Creating worktree:', { branch, baseBranch, path });
  
  try {
    const worktree = await worktreeManager.createWorktree(branch, baseBranch, path);
    console.log('[API] Worktree created successfully:', worktree);
    return c.json(worktree);
  } catch (error: any) {
    console.error('[API] Error creating worktree:', error);
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
      const unsubscribe = interactionStore.subscribe((event) => {
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