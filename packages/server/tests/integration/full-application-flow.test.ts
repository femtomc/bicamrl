import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { spawn, type Subprocess } from 'bun';
import { InteractionStore } from '../../src/interaction/store';
import { MessageStore } from '../../src/message/store';
import { LLMService } from '../../src/llm/service';
import { WorktreeService } from '../../src/worktree/service';
import type { Interaction, InteractionEvent } from '../../src/interaction/types';
import type { MessageEvent } from '../../src/message/store';

// Test utilities
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForCondition(
  check: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await sleep(interval);
  }
  throw new Error('Timeout waiting for condition');
}

describe('Full Application Flow Integration Tests', () => {
  let serverProcess: Subprocess | null = null;
  let serverUrl: string;
  const serverPort = 3457; // Use different port to avoid conflicts

  beforeAll(async () => {
    // Start the server
    serverProcess = spawn(['bun', 'run', 'start'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(serverPort),
        ENABLE_TOOLS: 'true',
        DEFAULT_PROVIDER: 'mock' // Use mock provider for predictable tests
      }
    });

    serverUrl = `http://localhost:${serverPort}`;

    // Wait for server to be ready
    await waitForCondition(async () => {
      try {
        const response = await fetch(`${serverUrl}/health`);
        return response.ok;
      } catch {
        return false;
      }
    }, 10000);
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
      await serverProcess.exited;
    }
  });

  describe('Basic Message Flow', () => {
    test('user sends message and receives response', async () => {
      // Send a message
      const messageResponse = await fetch(`${serverUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Hello, Bicamrl!'
        })
      });

      expect(messageResponse.ok).toBe(true);
      const { interactionId } = await messageResponse.json();
      expect(interactionId).toBeDefined();

      // Wait for processing
      await waitForCondition(async () => {
        const response = await fetch(`${serverUrl}/interactions/${interactionId}`);
        const interaction = await response.json();
        return interaction.status === 'completed';
      });

      // Get the interaction with messages
      const interactionResponse = await fetch(`${serverUrl}/interactions/${interactionId}`);
      const interaction = await interactionResponse.json();

      expect(interaction.messages).toHaveLength(2);
      expect(interaction.messages[0].role).toBe('user');
      expect(interaction.messages[0].content).toBe('Hello, Bicamrl!');
      expect(interaction.messages[1].role).toBe('assistant');
      expect(interaction.messages[1].content).toContain('Mock response');
    });

    test('handles multiple concurrent messages', async () => {
      const messages = [
        'First message',
        'Second message',
        'Third message'
      ];

      // Send all messages concurrently
      const responses = await Promise.all(
        messages.map(content =>
          fetch(`${serverUrl}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
          }).then(r => r.json())
        )
      );

      const interactionIds = responses.map(r => r.interactionId);
      expect(interactionIds).toHaveLength(3);
      expect(new Set(interactionIds).size).toBe(3); // All unique

      // Wait for all to complete
      await Promise.all(
        interactionIds.map(id =>
          waitForCondition(async () => {
            const response = await fetch(`${serverUrl}/interactions/${id}`);
            const interaction = await response.json();
            return interaction.status === 'completed';
          })
        )
      );

      // Verify all completed successfully
      for (let i = 0; i < interactionIds.length; i++) {
        const response = await fetch(`${serverUrl}/interactions/${interactionIds[i]}`);
        const interaction = await response.json();
        
        expect(interaction.status).toBe('completed');
        expect(interaction.messages[0].content).toBe(messages[i]);
        expect(interaction.messages[1].role).toBe('assistant');
      }
    });
  });

  describe('Worktree Integration', () => {
    test('creates worktree and processes message in context', async () => {
      // Create a worktree
      const worktreeResponse = await fetch(`${serverUrl}/worktrees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-feature',
          description: 'Test feature branch'
        })
      });

      expect(worktreeResponse.ok).toBe(true);
      const worktree = await worktreeResponse.json();
      expect(worktree.id).toBeDefined();
      expect(worktree.path).toContain('worktrees/test-feature');

      // Send message with worktree context
      const messageResponse = await fetch(`${serverUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'List files in this worktree',
          worktreeId: worktree.id
        })
      });

      expect(messageResponse.ok).toBe(true);
      const { interactionId } = await messageResponse.json();

      // Wait for completion
      await waitForCondition(async () => {
        const response = await fetch(`${serverUrl}/interactions/${interactionId}`);
        const interaction = await response.json();
        return interaction.status === 'completed';
      });

      // Verify worktree context was used
      const interactionResponse = await fetch(`${serverUrl}/interactions/${interactionId}`);
      const interaction = await interactionResponse.json();
      
      expect(interaction.metadata.worktreeContext).toBeDefined();
      expect(interaction.metadata.worktreeContext.worktreeId).toBe(worktree.id);
      expect(interaction.metadata.worktreeContext.worktreePath).toBe(worktree.path);

      // Clean up
      await fetch(`${serverUrl}/worktrees/${worktree.id}`, {
        method: 'DELETE'
      });
    });
  });

  describe('Tool Permission Flow', () => {
    test('requests and approves tool permission', async () => {
      // Use a different provider that supports tools
      const messageResponse = await fetch(`${serverUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Read the README file',
          provider: 'mock' // Mock provider simulates tool calls
        })
      });

      const { interactionId } = await messageResponse.json();

      // Wait for permission request
      await waitForCondition(async () => {
        const response = await fetch(`${serverUrl}/interactions/${interactionId}`);
        const interaction = await response.json();
        return interaction.messages.some((m: any) => 
          m.metadata?.permissionRequest
        );
      });

      // Find the permission request
      const interactionResponse = await fetch(`${serverUrl}/interactions/${interactionId}`);
      const interaction = await interactionResponse.json();
      const permissionMessage = interaction.messages.find((m: any) => 
        m.metadata?.permissionRequest
      );

      expect(permissionMessage).toBeDefined();
      const requestId = permissionMessage.metadata.permissionRequest.requestId;

      // Approve the permission
      const approveResponse = await fetch(`${serverUrl}/permissions/${requestId}/approve`, {
        method: 'POST'
      });
      expect(approveResponse.ok).toBe(true);

      // Wait for final completion
      await waitForCondition(async () => {
        const response = await fetch(`${serverUrl}/interactions/${interactionId}`);
        const interaction = await response.json();
        return interaction.status === 'completed';
      });

      // Verify tool was executed
      const finalResponse = await fetch(`${serverUrl}/interactions/${interactionId}`);
      const finalInteraction = await finalResponse.json();
      
      const assistantMessage = finalInteraction.messages.find((m: any) => 
        m.role === 'assistant' && m.metadata?.toolsUsed
      );
      expect(assistantMessage).toBeDefined();
      expect(assistantMessage.metadata.toolsUsed).toContain('Read');
    });

    test('denies tool permission', async () => {
      const messageResponse = await fetch(`${serverUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Delete all files',
          provider: 'mock'
        })
      });

      const { interactionId } = await messageResponse.json();

      // Wait for permission request
      await waitForCondition(async () => {
        const response = await fetch(`${serverUrl}/interactions/${interactionId}`);
        const interaction = await response.json();
        return interaction.messages.some((m: any) => 
          m.metadata?.permissionRequest
        );
      });

      // Find and deny permission
      const interactionResponse = await fetch(`${serverUrl}/interactions/${interactionId}`);
      const interaction = await interactionResponse.json();
      const permissionMessage = interaction.messages.find((m: any) => 
        m.metadata?.permissionRequest
      );
      const requestId = permissionMessage.metadata.permissionRequest.requestId;

      const denyResponse = await fetch(`${serverUrl}/permissions/${requestId}/deny`, {
        method: 'POST'
      });
      expect(denyResponse.ok).toBe(true);

      // Wait for completion
      await waitForCondition(async () => {
        const response = await fetch(`${serverUrl}/interactions/${interactionId}`);
        const interaction = await response.json();
        return interaction.status === 'completed';
      });

      // Verify tool was not executed
      const finalResponse = await fetch(`${serverUrl}/interactions/${interactionId}`);
      const finalInteraction = await finalResponse.json();
      
      const denialMessage = finalInteraction.messages.find((m: any) => 
        m.content.includes('permission denied')
      );
      expect(denialMessage).toBeDefined();
    });
  });

  describe('Real-time Updates via SSE', () => {
    test('receives live updates during processing', async () => {
      const events: any[] = [];
      
      // Connect to SSE stream
      const eventSource = new EventSource(`${serverUrl}/stream`);
      
      eventSource.onmessage = (event) => {
        events.push(JSON.parse(event.data));
      };

      // Wait for connection
      await sleep(100);

      // Send a message
      const messageResponse = await fetch(`${serverUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Process this with updates'
        })
      });

      const { interactionId } = await messageResponse.json();

      // Wait for completion and collect events
      await waitForCondition(async () => {
        const response = await fetch(`${serverUrl}/interactions/${interactionId}`);
        const interaction = await response.json();
        return interaction.status === 'completed';
      });

      // Close connection
      eventSource.close();

      // Verify we received the expected events
      const interactionEvents = events.filter(e => 
        e.data?.interaction?.id === interactionId ||
        e.data?.message?.interactionId === interactionId
      );

      expect(interactionEvents.length).toBeGreaterThan(0);
      
      // Should have interaction created/updated events
      expect(interactionEvents.some(e => e.type === 'interaction:created')).toBe(true);
      expect(interactionEvents.some(e => e.type === 'interaction:updated')).toBe(true);
      
      // Should have message events
      expect(interactionEvents.some(e => e.type === 'message:added')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('handles invalid requests gracefully', async () => {
      // Missing content
      const response1 = await fetch(`${serverUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(response1.status).toBe(400);

      // Invalid worktree ID
      const response2 = await fetch(`${serverUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Test',
          worktreeId: 'invalid-worktree-id'
        })
      });
      expect(response2.status).toBe(404);

      // Invalid interaction ID
      const response3 = await fetch(`${serverUrl}/interactions/invalid-id`);
      expect(response3.status).toBe(404);
    });

    test('handles provider errors', async () => {
      // Force an error by using a provider that will fail
      const messageResponse = await fetch(`${serverUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Cause an error',
          provider: 'error' // Special provider that always errors
        })
      });

      const { interactionId } = await messageResponse.json();

      // Wait for failure
      await waitForCondition(async () => {
        const response = await fetch(`${serverUrl}/interactions/${interactionId}`);
        const interaction = await response.json();
        return interaction.status === 'failed';
      });

      // Verify error details
      const interactionResponse = await fetch(`${serverUrl}/interactions/${interactionId}`);
      const interaction = await interactionResponse.json();
      
      expect(interaction.status).toBe('failed');
      expect(interaction.error).toBeDefined();
      expect(interaction.error.message).toContain('error');
    });
  });

  describe('Conversation Continuity', () => {
    test('maintains conversation context across messages', async () => {
      // Start a conversation
      const response1 = await fetch(`${serverUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'My name is Alice'
        })
      });

      const { interactionId: id1 } = await response1.json();
      
      await waitForCondition(async () => {
        const response = await fetch(`${serverUrl}/interactions/${id1}`);
        const interaction = await response.json();
        return interaction.status === 'completed';
      });

      // Continue the conversation
      const response2 = await fetch(`${serverUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'What is my name?',
          parentInteractionId: id1
        })
      });

      const { interactionId: id2 } = await response2.json();
      
      await waitForCondition(async () => {
        const response = await fetch(`${serverUrl}/interactions/${id2}`);
        const interaction = await response.json();
        return interaction.status === 'completed';
      });

      // Verify context was maintained
      const finalResponse = await fetch(`${serverUrl}/interactions/${id2}`);
      const finalInteraction = await finalResponse.json();
      
      const assistantResponse = finalInteraction.messages.find((m: any) => 
        m.role === 'assistant'
      );
      
      // Mock provider should echo back context
      expect(assistantResponse.content.toLowerCase()).toContain('alice');
    });
  });

  describe('Performance and Scalability', () => {
    test('handles rapid message submission', async () => {
      const messageCount = 10;
      const startTime = Date.now();

      // Send messages rapidly
      const promises = Array.from({ length: messageCount }, (_, i) =>
        fetch(`${serverUrl}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `Rapid message ${i + 1}`
          })
        }).then(r => r.json())
      );

      const responses = await Promise.all(promises);
      const submissionTime = Date.now() - startTime;

      // All should be accepted quickly
      expect(responses).toHaveLength(messageCount);
      expect(submissionTime).toBeLessThan(1000); // Should accept all within 1 second

      // Wait for all to complete
      await Promise.all(
        responses.map(({ interactionId }) =>
          waitForCondition(async () => {
            const response = await fetch(`${serverUrl}/interactions/${interactionId}`);
            const interaction = await response.json();
            return interaction.status === 'completed';
          }, 30000) // Allow more time for processing
        )
      );

      // Verify all completed successfully
      for (const { interactionId } of responses) {
        const response = await fetch(`${serverUrl}/interactions/${interactionId}`);
        const interaction = await response.json();
        expect(interaction.status).toBe('completed');
      }
    });
  });

  describe('Health and Monitoring', () => {
    test('health endpoint provides system status', async () => {
      const response = await fetch(`${serverUrl}/health`);
      expect(response.ok).toBe(true);
      
      const health = await response.json();
      expect(health.status).toBe('healthy');
      expect(health.version).toBeDefined();
      expect(health.uptime).toBeGreaterThan(0);
    });

    test('metrics endpoint provides statistics', async () => {
      // Generate some activity first
      await fetch(`${serverUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Test for metrics' })
      });

      const response = await fetch(`${serverUrl}/metrics`);
      expect(response.ok).toBe(true);
      
      const metrics = await response.json();
      expect(metrics.interactions).toBeDefined();
      expect(metrics.interactions.total).toBeGreaterThan(0);
      expect(metrics.messages).toBeDefined();
      expect(metrics.messages.total).toBeGreaterThan(0);
    });
  });
});