#!/usr/bin/env bun

/**
 * Wake Process - Persistent HTTP client that handles a single interaction
 * 
 * This script is spawned with:
 * - Working directory set to the appropriate worktree
 * - Interaction ID as command line argument
 * - Uses SSE to listen for new messages
 * - Stays alive until interaction is closed
 */

import { loadMindConfig } from '../config/mind';
import { LLMService, MockLLMProvider } from '../llm/service';
import { ClaudeCodeLLMProvider } from '../llm/providers/claude-code';
import { ToolRegistry, ReadFileTool, WriteFileTool, ListDirectoryTool } from '../tools';

// Get interaction ID and server URL from environment/args
const interactionId = process.argv[2];
const serverUrl = process.env.BICAMRL_SERVER_URL || 'http://localhost:3456';

if (!interactionId) {
  console.error('[WakeProcess] No interaction ID provided');
  process.exit(1);
}

console.log(`[WakeProcess] Starting for interaction ${interactionId}`);
console.log(`[WakeProcess] Working directory: ${process.cwd()}`);
console.log(`[WakeProcess] Server URL: ${serverUrl}`);

// Set up error handlers
process.on('uncaughtException', (error) => {
  console.error('[WakeProcess] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[WakeProcess] Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Track processed message count to avoid reprocessing
let processedMessageCount = 0;

async function fetchInteraction(): Promise<any> {
  console.log(`[WakeProcess] Fetching interaction from ${serverUrl}/interactions/${interactionId}`);
  const response = await fetch(`${serverUrl}/interactions/${interactionId}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch interaction: ${response.statusText} - ${text}`);
  }
  const data = await response.json() as any;
  console.log(`[WakeProcess] Fetched interaction with ${data.content?.length || 0} messages`);
  return data;
}

async function submitResult(result: any) {
  const response = await fetch(`${serverUrl}/interactions/${interactionId}/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to submit result: ${response.statusText}`);
  }
}

async function connectToSSE() {
  console.log('[WakeProcess] Connecting to SSE stream...');
  
  const response = await fetch(`${serverUrl}/stream`, {
    headers: {
      'Accept': 'text/event-stream',
    }
  });
  
  if (!response.ok || !response.body) {
    throw new Error('Failed to connect to SSE stream');
  }
  
  return response.body;
}

async function processMessages() {
  // Initialize services once
  const mindConfig = loadMindConfig();
  
  const llmService = new LLMService(mindConfig.default_provider);
  llmService.registerProvider('mock', new MockLLMProvider());
  llmService.registerProvider('claude_code', new ClaudeCodeLLMProvider());
  
  const enableTools = mindConfig.agents?.enable_tools ?? false;
  const toolRegistry = new ToolRegistry();
  
  if (enableTools) {
    toolRegistry.register(new ReadFileTool());
    toolRegistry.register(new WriteFileTool());
    toolRegistry.register(new ListDirectoryTool());
    console.log('[WakeProcess] Tools enabled:', toolRegistry.getTools().map(t => t.name));
  }
  
  // Connect to SSE stream
  const stream = await connectToSSE();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  console.log('[WakeProcess] Listening for events...');
  
  // Process initial interaction immediately
  await processInteractionIfNeeded(llmService, toolRegistry);
  
  while (true) {
    const { done, value } = await reader.read();
    
    if (done) {
      console.log('[WakeProcess] SSE stream closed');
      break;
    }
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          
          // Check if this event is for our interaction
          if ((event.type === 'interaction_updated' || event.type === 'interaction_completed') && 
              event.data?.interactionId === interactionId) {
            
            console.log('[WakeProcess] Received event for our interaction');
            
            // Check if interaction is completed
            if (event.type === 'interaction_completed') {
              console.log('[WakeProcess] Interaction completed, exiting');
              return;
            }
            
            // Process new messages
            await processInteractionIfNeeded(llmService, toolRegistry);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }
}

async function processInteractionIfNeeded(llmService: LLMService, toolRegistry: ToolRegistry) {
  try {
    // Fetch current interaction state
    const interactionData = await fetchInteraction();
    
    // Check if there are new messages to process
    const currentMessageCount = interactionData.content.length;
    if (currentMessageCount <= processedMessageCount) {
      return; // No new messages
    }
    
    console.log(`[WakeProcess] Processing new messages (${processedMessageCount} -> ${currentMessageCount})`);
    
    // If we're already waiting for permission and no response yet, don't process
    if (interactionData.status === 'waiting_for_permission' && 
        interactionData.metadata?.permissionResponse === undefined) {
      console.log('[WakeProcess] Already waiting for permission, skipping processing');
      processedMessageCount = currentMessageCount;
      return;
    }
    
    // Build messages from content
    const messages = interactionData.content.map((item: any) => ({
      role: item.role as 'user' | 'assistant' | 'system',
      content: item.content
    }));
    
    // Check if this is a permission response
    if (interactionData.status === 'waiting_for_permission' && 
        interactionData.metadata?.permissionResponse !== undefined) {
      
      const approved = interactionData.metadata.permissionResponse;
      console.log('[WakeProcess] Processing permission response:', approved ? 'approved' : 'denied');
      
      if (approved && interactionData.metadata?.pendingToolCall) {
        // Execute the tool
        const toolCall = interactionData.metadata.pendingToolCall;
        console.log('[WakeProcess] Executing approved tool:', toolCall);
        
        const toolResult = await executeTool(toolRegistry, toolCall.name, toolCall.arguments);
        console.log('[WakeProcess] Tool result:', toolResult);
        
        // Add tool result to messages
        messages.push({
          role: 'tool' as any,
          content: JSON.stringify(toolResult),
          tool_use_id: toolCall.id
        });
        
        // Get final response
        const tools = toolRegistry.getTools();
        const response = await llmService.completeWithTools(messages, tools);
        
        await submitResult({
          response: response.content,
          model: response.model,
          usage: response.usage,
          metadata: { status: 'completed' }
        });
      } else {
        // User denied
        await submitResult({
          response: "I understand. I won't use that tool. Is there anything else I can help you with?",
          metadata: { status: 'completed' }
        });
      }
    } else {
      // Normal query processing
      console.log('[WakeProcess] Processing normal query');
      
      const tools = toolRegistry.getTools();
      const response = await llmService.completeWithTools(messages, tools);
      console.log('[WakeProcess] Got LLM response');
      
      // Handle tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        console.log('[WakeProcess] LLM wants to use tools:', response.toolCalls);
        
        const toolCall = response.toolCalls[0];
        if (!toolCall) {
          throw new Error('No tool call found');
        }
        
        await submitResult({
          response: `I'd like to use the ${toolCall.name} tool to help with your request. This tool ${getToolDescription(toolRegistry, toolCall.name)}.\n\nMay I proceed?`,
          model: response.model,
          usage: response.usage,
          metadata: {
            status: 'waiting_for_permission',
            pendingToolCall: toolCall,
            toolPermission: {
              toolName: toolCall.name,
              description: getToolDescription(toolRegistry, toolCall.name),
              arguments: toolCall.arguments,
              requestId: toolCall.id
            }
          }
        });
      } else {
        // No tool calls, return response
        await submitResult({
          response: response.content,
          model: response.model,
          usage: response.usage,
          metadata: { status: 'completed' }
        });
      }
    }
    
    // Update processed count
    processedMessageCount = currentMessageCount;
    
  } catch (error) {
    console.error('[WakeProcess] Error processing interaction:', error);
    
    try {
      await submitResult({
        error: String(error),
        metadata: { status: 'failed' }
      });
    } catch (submitError) {
      console.error('[WakeProcess] Failed to submit error:', submitError);
    }
  }
}

async function executeTool(toolRegistry: ToolRegistry, toolName: string, args: any): Promise<any> {
  // Map Claude Code tool names to our tool names
  const toolNameMap: Record<string, string> = {
    'Read': 'read_file',
    'Write': 'write_file',
    'LS': 'list_directory',
    'TodoRead': 'read_file',
    'TodoWrite': 'write_file',
    'Glob': 'list_directory',
    'Grep': 'read_file',
    'Edit': 'write_file',
    'MultiEdit': 'write_file'
  };
  
  const mappedName = toolNameMap[toolName] || toolName;
  const tool = toolRegistry.getTool(mappedName);
  if (!tool) {
    throw new Error(`Tool ${toolName} (mapped to ${mappedName}) not found`);
  }
  
  // Map Claude Code arguments to our tool arguments
  let mappedArgs = args;
  if (toolName === 'Read' || toolName === 'TodoRead') {
    mappedArgs = { path: args.file_path || args.path };
  } else if (toolName === 'Write' || toolName === 'TodoWrite') {
    mappedArgs = { path: args.file_path || args.path, content: args.content || args.contents };
  } else if (toolName === 'LS' || toolName === 'Glob') {
    mappedArgs = { path: args.path || args.pattern || '.' };
  }
  
  return await tool.execute(mappedArgs);
}

function getToolDescription(toolRegistry: ToolRegistry, toolName: string): string {
  const toolNameMap: Record<string, string> = {
    'Read': 'read_file',
    'Write': 'write_file',
    'LS': 'list_directory',
    'TodoRead': 'read_file',
    'TodoWrite': 'write_file',
    'Glob': 'list_directory',
    'Grep': 'read_file',
    'Edit': 'write_file',
    'MultiEdit': 'write_file'
  };
  
  const mappedName = toolNameMap[toolName] || toolName;
  const tool = toolRegistry.getTool(mappedName);
  return tool?.description || 'performs an action';
}

// Run the process
processMessages().then(() => {
  console.log('[WakeProcess] Exiting normally');
  process.exit(0);
}).catch(error => {
  console.error('[WakeProcess] Fatal error:', error);
  process.exit(1);
});