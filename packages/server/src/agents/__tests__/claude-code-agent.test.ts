import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { ClaudeCodeAgent } from '../claude-code-agent';
import { MCPPermissionStrategy } from '../permission-strategies/mcp-permission-strategy';
import { ClaudeCodeLLMProvider } from '../../llm/providers/claude-code';
import { Interaction, InteractionType } from '../../interaction/types';
import { Message } from '../../message/types';
import type { AgentResponse } from '../types';

describe('ClaudeCodeAgent', () => {
  let agent: ClaudeCodeAgent;
  const interactionId = 'test-interaction-123';
  const serverUrl = 'http://localhost:3456';

  beforeEach(() => {
    // Create agent without initializing (to control initialization in tests)
    agent = new ClaudeCodeAgent(interactionId, serverUrl, {
      model: 'claude-3-opus',
      maxTokens: 2048
    });
  });

  describe('initialization', () => {
    test('sets up MCP permission strategy when tools enabled', async () => {
      // Enable tools
      process.env.ENABLE_TOOLS = 'true';
      
      // Mock MCPPermissionStrategy
      let strategyInitialized = false;
      const originalInitialize = MCPPermissionStrategy.prototype.initialize;
      MCPPermissionStrategy.prototype.initialize = async function() {
        strategyInitialized = true;
      };

      try {
        await agent.initialize();
        expect(strategyInitialized).toBe(true);
      } finally {
        MCPPermissionStrategy.prototype.initialize = originalInitialize;
        delete process.env.ENABLE_TOOLS;
      }
    });

    test('skips permission strategy when tools disabled', async () => {
      process.env.ENABLE_TOOLS = 'false';
      
      let strategyInitialized = false;
      const originalInitialize = MCPPermissionStrategy.prototype.initialize;
      MCPPermissionStrategy.prototype.initialize = async function() {
        strategyInitialized = true;
      };

      try {
        await agent.initialize();
        expect(strategyInitialized).toBe(false);
      } finally {
        MCPPermissionStrategy.prototype.initialize = originalInitialize;
        delete process.env.ENABLE_TOOLS;
      }
    });
  });

  describe('process', () => {
    test('processes interaction and returns response', async () => {
      // Create test interaction and messages
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY,
        metadata: {}
      });

      const messages: Message[] = [
        {
          id: 'msg-1',
          interactionId: interaction.id,
          role: 'user',
          content: 'Hello, Claude!',
          status: 'completed',
          timestamp: new Date(),
          metadata: {}
        }
      ];

      // Mock provider response
      const mockResponse = {
        content: 'Hello! How can I help you today?',
        model: 'claude-3-opus',
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30
        }
      };

      // Mock the provider's completeWithTools method
      const originalComplete = ClaudeCodeLLMProvider.prototype.completeWithTools;
      ClaudeCodeLLMProvider.prototype.completeWithTools = async function() {
        return mockResponse;
      };

      try {
        const response = await agent.process(interaction, messages);

        expect(response.content).toBe('Hello! How can I help you today?');
        expect(response.metadata?.model).toBe('claude-3-opus');
        expect(response.metadata?.usage?.totalTokens).toBe(30);
        expect(response.metadata?.processingTimeMs).toBeGreaterThanOrEqual(0);
      } finally {
        ClaudeCodeLLMProvider.prototype.completeWithTools = originalComplete;
      }
    });

    test('filters out system messages except permission requests', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      const messages: Message[] = [
        {
          id: 'msg-1',
          interactionId: interaction.id,
          role: 'system',
          content: 'System context',
          status: 'completed',
          timestamp: new Date(),
          metadata: {}
        },
        {
          id: 'msg-2',
          interactionId: interaction.id,
          role: 'user',
          content: 'User message',
          status: 'completed',
          timestamp: new Date(),
          metadata: {}
        },
        {
          id: 'msg-3',
          interactionId: interaction.id,
          role: 'system',
          content: 'Permission required',
          status: 'completed',
          timestamp: new Date(),
          metadata: {
            permissionRequest: {
              toolName: 'bash',
              description: 'Execute command'
            }
          }
        }
      ];

      let capturedMessages: any[] = [];
      const originalComplete = ClaudeCodeLLMProvider.prototype.completeWithTools;
      ClaudeCodeLLMProvider.prototype.completeWithTools = async function(msgs: any[]) {
        capturedMessages = msgs;
        return { content: 'Response', model: 'claude-3' };
      };

      try {
        await agent.process(interaction, messages);

        // Should include user message and permission request, but not regular system message
        expect(capturedMessages).toHaveLength(2);
        expect(capturedMessages[0].content).toBe('User message');
        expect(capturedMessages[1].content).toBe('Permission required');
      } finally {
        ClaudeCodeLLMProvider.prototype.completeWithTools = originalComplete;
      }
    });

    test('tracks tool usage in response metadata', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.ACTION
      });

      const messages: Message[] = [{
        id: 'msg-1',
        interactionId: interaction.id,
        role: 'user',
        content: 'Read the README file',
        status: 'completed',
        timestamp: new Date(),
        metadata: {}
      }];

      // Mock response with tool calls
      const mockResponse = {
        content: 'I read the README file for you.',
        toolCalls: [
          { id: 'call-1', name: 'Read', arguments: { path: 'README.md' } }
        ],
        model: 'claude-3-opus',
        usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 }
      };

      const originalComplete = ClaudeCodeLLMProvider.prototype.completeWithTools;
      ClaudeCodeLLMProvider.prototype.completeWithTools = async function() {
        return mockResponse;
      };

      try {
        const response = await agent.process(interaction, messages);

        expect(response.toolCalls).toHaveLength(1);
        expect(response.toolCalls![0].name).toBe('Read');
        expect(response.metadata?.toolsUsed).toEqual(['Read']);
      } finally {
        ClaudeCodeLLMProvider.prototype.completeWithTools = originalComplete;
      }
    });

    test('reports token updates during processing', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      const messages: Message[] = [{
        id: 'msg-1',
        interactionId: interaction.id,
        role: 'user',
        content: 'Test message',
        status: 'completed',
        timestamp: new Date(),
        metadata: {}
      }];

      const tokenUpdates: number[] = [];
      
      const originalComplete = ClaudeCodeLLMProvider.prototype.completeWithTools;
      ClaudeCodeLLMProvider.prototype.completeWithTools = async function(msgs: any[], tools: any[], options?: any) {
        // Simulate token updates
        if (options?.onTokenUpdate) {
          await options.onTokenUpdate(10);
          await options.onTokenUpdate(20);
          await options.onTokenUpdate(30);
        }
        return { content: 'Response', model: 'claude-3' };
      };

      // Capture console logs
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
      };

      try {
        await agent.process(interaction, messages);

        // Should have logged token updates
        const tokenLogs = logs.filter(log => log.includes('Tokens generated'));
        expect(tokenLogs).toHaveLength(3);
        expect(tokenLogs[0]).toContain('10');
        expect(tokenLogs[1]).toContain('20');
        expect(tokenLogs[2]).toContain('30');
      } finally {
        ClaudeCodeLLMProvider.prototype.completeWithTools = originalComplete;
        console.log = originalLog;
      }
    });
  });

  describe('handleToolCall', () => {
    test('delegates to Claude Code SDK', async () => {
      const toolCall = {
        id: 'call-123',
        name: 'Read',
        arguments: { path: '/test.txt' }
      };

      const result = await agent.handleToolCall(toolCall);

      expect(result.success).toBe(true);
      expect(result.result).toBe('Handled by Claude Code SDK');
    });
  });

  describe('cleanup', () => {
    test('cleans up permission strategy', async () => {
      process.env.ENABLE_TOOLS = 'true';
      
      let cleanupCalled = false;
      const originalCleanup = MCPPermissionStrategy.prototype.cleanup;
      MCPPermissionStrategy.prototype.cleanup = async function() {
        cleanupCalled = true;
      };

      try {
        await agent.initialize();
        await agent.cleanup();
        expect(cleanupCalled).toBe(true);
      } finally {
        MCPPermissionStrategy.prototype.cleanup = originalCleanup;
        delete process.env.ENABLE_TOOLS;
      }
    });

    test('handles cleanup when no permission strategy', async () => {
      // Don't initialize, so no permission strategy
      await expect(async () => {
        await agent.cleanup();
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    test('propagates provider errors', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      const messages: Message[] = [{
        id: 'msg-1',
        interactionId: interaction.id,
        role: 'user',
        content: 'Test',
        status: 'completed',
        timestamp: new Date(),
        metadata: {}
      }];

      const originalComplete = ClaudeCodeLLMProvider.prototype.completeWithTools;
      ClaudeCodeLLMProvider.prototype.completeWithTools = async function() {
        throw new Error('Claude Code API error');
      };

      try {
        await expect(agent.process(interaction, messages))
          .rejects.toThrow('Claude Code API error');
      } finally {
        ClaudeCodeLLMProvider.prototype.completeWithTools = originalComplete;
      }
    });
  });
});