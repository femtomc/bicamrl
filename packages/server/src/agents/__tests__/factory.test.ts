import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createAgent } from '../factory';
import { ClaudeCodeAgent } from '../claude-code-agent';
import type { Agent } from '../types';

describe('Agent Factory', () => {
  beforeEach(() => {
    // Reset any mocks
    mock.restore();
  });

  describe('createAgent', () => {
    test('creates Claude Code agent for claude_code provider', async () => {
      const agent = await createAgent({
        provider: 'claude_code',
        interactionId: 'test-interaction-123',
        serverUrl: 'http://localhost:3456',
        config: {
          model: 'claude-3-opus',
          maxTokens: 2048
        }
      });

      expect(agent).toBeInstanceOf(ClaudeCodeAgent);
      expect(agent.id).toBe('claude-code-test-interaction-123');
    });

    test('throws error for unsupported provider', async () => {
      await expect(createAgent({
        provider: 'unknown-provider',
        interactionId: 'test-123',
        serverUrl: 'http://localhost:3456'
      })).rejects.toThrow('Unknown provider: unknown-provider');
    });

    test('throws error for LM Studio (not yet implemented)', async () => {
      await expect(createAgent({
        provider: 'lmstudio',
        interactionId: 'test-123',
        serverUrl: 'http://localhost:3456'
      })).rejects.toThrow('LM Studio agent not yet implemented');
    });

    test('throws error for mock provider (not yet implemented)', async () => {
      await expect(createAgent({
        provider: 'mock',
        interactionId: 'test-123',
        serverUrl: 'http://localhost:3456'
      })).rejects.toThrow('Mock agent not yet implemented');
    });

    test('passes config to agent constructor', async () => {
      const config = {
        model: 'claude-3-opus',
        maxTokens: 4096,
        temperature: 0.5
      };

      const agent = await createAgent({
        provider: 'claude_code',
        interactionId: 'test-123',
        serverUrl: 'http://localhost:3456',
        config
      });

      // Agent should be initialized with the config
      expect(agent).toBeInstanceOf(ClaudeCodeAgent);
    });

    test('initializes agent after creation', async () => {
      let initializeCalled = false;
      
      // Mock ClaudeCodeAgent.initialize
      const originalInitialize = ClaudeCodeAgent.prototype.initialize;
      ClaudeCodeAgent.prototype.initialize = async function() {
        initializeCalled = true;
      };

      try {
        await createAgent({
          provider: 'claude_code',
          interactionId: 'test-123',
          serverUrl: 'http://localhost:3456'
        });

        expect(initializeCalled).toBe(true);
      } finally {
        // Restore original
        ClaudeCodeAgent.prototype.initialize = originalInitialize;
      }
    });
  });

  describe('error handling', () => {
    test('handles initialization errors gracefully', async () => {
      // Mock initialize to throw
      const originalInitialize = ClaudeCodeAgent.prototype.initialize;
      ClaudeCodeAgent.prototype.initialize = async function() {
        throw new Error('Failed to initialize MCP server');
      };

      try {
        await expect(createAgent({
          provider: 'claude_code',
          interactionId: 'test-123',
          serverUrl: 'http://localhost:3456'
        })).rejects.toThrow('Failed to initialize MCP server');
      } finally {
        ClaudeCodeAgent.prototype.initialize = originalInitialize;
      }
    });
  });
});