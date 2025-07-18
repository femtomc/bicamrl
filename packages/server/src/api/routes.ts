import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { InteractionStore } from '../interaction/store';
import { MessageStore } from '../message/store';
import { WakeProcessor } from '../agents/wake-processor';
import { LLMService, MockLLMProvider } from '../llm/service';
import { ClaudeCodeLLMProvider } from '../llm/providers/claude-code';
import { LMStudioLLMProvider } from '../llm/providers/lmstudio';
import { loadMindConfig } from '../config/mind';
import { WorktreeManager } from '../worktree/manager';
import { InMemoryWorktreeStore } from '../worktree/memory-store';
import { createMonitoringRoutes } from './monitoring';
import { ConversationService } from '../services/conversation-service';
import { WorktreeService } from '../services/worktree-service';
import { createSSEStream } from '../utils/sse';

/**
 * Clean API routes with proper separation of concerns
 * 
 * Improvements:
 * - Services handle business logic
 * - Routes only handle HTTP concerns
 * - Proper error handling
 * - No god object pattern
 */

// Initialize services (this should ideally be in a DI container)
const initializeServices = async () => {
  // Load configuration
  const mindConfig = loadMindConfig();
  
  // Initialize LLM service
  const llmService = new LLMService(mindConfig.default_provider);
  llmService.registerProvider('mock', new MockLLMProvider());
  llmService.registerProvider('claude_code', new ClaudeCodeLLMProvider());
  llmService.registerProvider('lmstudio', new LMStudioLLMProvider({
    baseURL: mindConfig.llm_providers?.lmstudio?.api_base,
    model: mindConfig.llm_providers?.lmstudio?.model,
  }));
  
  // Initialize stores
  const interactionStore = new InteractionStore();
  const messageStore = new MessageStore();
  const worktreeStore = new InMemoryWorktreeStore();
  
  // Initialize worktree manager
  const repoRoot = process.env.BICAMRL_REPO_ROOT || process.cwd();
  const worktreeManager = new WorktreeManager(repoRoot, worktreeStore);
  await worktreeManager.initialize();
  
  // Initialize services
  const conversationService = new ConversationService(interactionStore, messageStore, worktreeManager);
  const worktreeService = new WorktreeService(worktreeManager);
  
  // Initialize wake processor
  const enableTools = mindConfig.agents?.enable_tools ?? false;
  const wakeProcessor = new WakeProcessor(interactionStore, messageStore, llmService, enableTools);
  await wakeProcessor.start();
  
  return {
    interactionStore,
    messageStore,
    conversationService,
    worktreeService,
    wakeProcessor,
    mindConfig
  };
};

export const createApp = async (options?: { port?: number }) => {
  const app = new Hono();
  
  // Middleware
  app.use('*', cors());
  
  // Initialize services with optional port override
  const port = options?.port || process.env.PORT || 3456;
  const services = await initializeServices();
  const { interactionStore, messageStore, conversationService, worktreeService, wakeProcessor } = services;
  
  // Store port for Wake processes to use
  (wakeProcessor as any).serverPort = port;
  
  // Add monitoring routes
  const monitoringRoutes = createMonitoringRoutes(wakeProcessor);
  app.route('/monitoring', monitoringRoutes);
  
  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'ok' });
  });
  
  // Conversation routes
  app.get('/interactions', async (c) => {
    const conversations = await conversationService.getAllConversations();
    return c.json(conversations);
  });
  
  app.get('/interactions/:id', async (c) => {
    const id = c.req.param('id');
    const conversation = await conversationService.getConversation(id);
    
    if (!conversation) {
      return c.json({ error: 'Interaction not found' }, 404);
    }
    
    return c.json(conversation);
  });
  
  app.post('/interactions/:id/result', async (c) => {
    try {
      const id = c.req.param('id');
      const result = await c.req.json();
      
      await conversationService.submitAssistantResponse(
        id, 
        result.content || result.response || 'Processing completed',
        result
      );
      return c.json({ success: true });
      
    } catch (error: any) {
      if (error.message === 'Interaction not found') {
        return c.json({ error: error.message }, 404);
      }
      console.error('[API] Error submitting result:', error);
      return c.json({ error: 'Failed to submit result' }, 500);
    }
  });
  
  // Message creation
  app.post('/message', async (c) => {
    try {
      const request = await c.req.json();
      const result = await conversationService.handleSendMessage(request);
      return c.json({
        id: result.interactionId,
        type: result.type === 'new_conversation' ? 'query' : 'message',
        messageId: result.messageId
      });
      
    } catch (error: any) {
      if (error.message === 'Content is required') {
        return c.json({ error: error.message }, 400);
      }
      console.error('[API] Error creating message:', error);
      return c.json({ error: 'Failed to create message' }, 500);
    }
  });
  
  // Worktree routes
  app.get('/worktrees', async (c) => {
    try {
      const worktrees = await worktreeService.listWorktrees();
      return c.json(worktrees);
    } catch (error) {
      return c.json({ error: 'Failed to list worktrees' }, 500);
    }
  });
  
  app.post('/worktrees', async (c) => {
    try {
      const request = await c.req.json();
      const worktree = await worktreeService.createWorktree(request);
      return c.json(worktree);
      
    } catch (error: any) {
      if (error.message === 'Branch name is required') {
        return c.json({ error: error.message }, 400);
      }
      return c.json({ error: error.message || 'Failed to create worktree' }, 500);
    }
  });
  
  // Interaction status update (for progress reporting)
  app.put('/interactions/:id/status', async (c) => {
    try {
      const interactionId = c.req.param('id');
      const metadata = await c.req.json();
      
      await interactionStore.updateMetadata(interactionId, metadata);
      return c.json({ success: true });
      
    } catch (error: any) {
      console.error('[API] Error updating interaction status:', error);
      return c.json({ error: 'Failed to update status' }, 500);
    }
  });
  
  // Message status update
  app.put('/messages/:id/status', async (c) => {
    try {
      const messageId = c.req.param('id');
      const { status } = await c.req.json();
      
      await messageStore.updateMessageStatus(messageId, status);
      return c.json({ success: true });
      
    } catch (error: any) {
      console.error('[API] Error updating message status:', error);
      return c.json({ error: 'Failed to update message status' }, 500);
    }
  });
  
  // Permission request
  app.post('/interactions/:id/permission', async (c) => {
    try {
      const interactionId = c.req.param('id');
      const { toolName, description, requestId } = await c.req.json();
      
      const messageId = await conversationService.createPermissionRequest(
        interactionId,
        toolName,
        description,
        requestId
      );
      
      return c.json({ messageId });
      
    } catch (error: any) {
      console.error('[API] Error creating permission request:', error);
      return c.json({ error: 'Failed to create permission request' }, 500);
    }
  });
  
  // Permission response
  app.post('/interactions/:id/permission/response', async (c) => {
    try {
      const interactionId = c.req.param('id');
      const { approved } = await c.req.json();
      
      await conversationService.handlePermissionResponse(interactionId, approved);
      return c.json({ success: true });
      
    } catch (error: any) {
      console.error('[API] Error handling permission response:', error);
      return c.json({ error: 'Failed to handle permission response' }, 500);
    }
  });
  
  // Permission status - for checking if permission was granted/denied
  app.get('/permissions/:requestId/status', async (c) => {
    try {
      const requestId = c.req.param('requestId');
      
      // Find the permission request in all interactions
      // This is a simple implementation - in production you'd want a dedicated permission store
      const interactions = interactionStore.getAll();
      
      for (const interaction of interactions) {
        const messages = messageStore.getMessages(interaction.id);
        
        // Find permission request message
        const permissionRequest = messages.find(m => 
          m.metadata?.permissionRequest?.requestId === requestId
        );
        
        if (permissionRequest) {
          // Check if there's a response after the request
          const requestIndex = messages.indexOf(permissionRequest);
          const responseMessage = messages.slice(requestIndex + 1).find(m => 
            m.metadata?.permissionResponse !== undefined
          );
          
          if (responseMessage) {
            return c.json({ 
              status: responseMessage.metadata.permissionResponse ? 'approved' : 'denied' 
            });
          } else {
            return c.json({ status: 'pending' });
          }
        }
      }
      
      return c.json({ status: 'not_found' }, 404);
      
    } catch (error: any) {
      console.error('[API] Error getting permission status:', error);
      return c.json({ error: 'Failed to get permission status' }, 500);
    }
  });
  
  // Approve permission shortcut
  app.post('/permissions/:requestId/approve', async (c) => {
    try {
      const requestId = c.req.param('requestId');
      
      // Find which interaction this permission belongs to
      const interactions = interactionStore.getAll();
      
      for (const interaction of interactions) {
        const messages = messageStore.getMessages(interaction.id);
        const hasRequest = messages.some(m => 
          m.metadata?.permissionRequest?.requestId === requestId
        );
        
        if (hasRequest) {
          await conversationService.handlePermissionResponse(interaction.id, true);
          return c.json({ success: true });
        }
      }
      
      return c.json({ error: 'Permission request not found' }, 404);
      
    } catch (error: any) {
      console.error('[API] Error approving permission:', error);
      return c.json({ error: 'Failed to approve permission' }, 500);
    }
  });
  
  // Deny permission shortcut  
  app.post('/permissions/:requestId/deny', async (c) => {
    try {
      const requestId = c.req.param('requestId');
      
      // Find which interaction this permission belongs to
      const interactions = interactionStore.getAll();
      
      for (const interaction of interactions) {
        const messages = messageStore.getMessages(interaction.id);
        const hasRequest = messages.some(m => 
          m.metadata?.permissionRequest?.requestId === requestId
        );
        
        if (hasRequest) {
          await conversationService.handlePermissionResponse(interaction.id, false);
          return c.json({ success: true });
        }
      }
      
      return c.json({ error: 'Permission request not found' }, 404);
      
    } catch (error: any) {
      console.error('[API] Error denying permission:', error);
      return c.json({ error: 'Failed to deny permission' }, 500);
    }
  });
  
  // SSE endpoint
  app.get('/stream', (c) => {
    const stream = createSSEStream(interactionStore, messageStore);
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  });
  
  // Legacy endpoint for compatibility
  app.get('/interactions/stream', (c) => {
    return c.redirect('/stream');
  });
  
  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down gracefully...');
    await wakeProcessor.stop();
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  // Attach services for testing
  (app as any).services = {
    interactionStore,
    messageStore,
    wakeProcessor,
    conversationService,
    worktreeService
  };
  
  return app;
};

// Export default app for backwards compatibility
export default createApp();