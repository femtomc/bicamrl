import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { WakeProcessor } from '../../agents/wake-processor';
import { InteractionStore } from '../../interaction/store';
import { MessageStore } from '../../message/store';
import { LLMService } from '../../llm/service';
import { ProcessManager } from '../../process/manager';
import { Interaction, InteractionType } from '../../interaction/types';
import { Message } from '../../message/types';
import type { Agent, AgentResponse } from '../types';

describe('Wake Processor Agent Integration', () => {
  let wakeProcessor: WakeProcessor;
  let interactionStore: InteractionStore;
  let messageStore: MessageStore;
  let llmService: LLMService;
  let mockAgent: Agent;

  beforeEach(() => {
    interactionStore = new InteractionStore();
    messageStore = new MessageStore();
    llmService = new LLMService('claude_code');
    
    wakeProcessor = new WakeProcessor(
      interactionStore,
      messageStore,
      llmService,
      true // enableTools
    );

    // Create a mock agent
    mockAgent = {
      id: 'mock-agent-123',
      async process(interaction: Interaction, messages: Message[]): Promise<AgentResponse> {
        return {
          content: 'Mock response',
          metadata: {
            model: 'mock-model',
            usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
          }
        };
      },
      async initialize() {},
      async cleanup() {}
    };
  });

  describe('Wake process spawning with agents', () => {
    test('spawns process for new interaction', async () => {
      // Track spawned processes
      const spawnedProcesses: any[] = [];
      const originalStartProcess = ProcessManager.prototype.startProcess;
      ProcessManager.prototype.startProcess = async function(config: any) {
        spawnedProcesses.push(config);
        return { id: config.id, pid: 12345 };
      };

      try {
        await wakeProcessor.start();

        // Create interaction
        const interaction = Interaction.create({
          source: 'user',
          type: InteractionType.QUERY
        });
        await interactionStore.create(interaction);

        // Wait for event processing
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(spawnedProcesses).toHaveLength(1);
        expect(spawnedProcesses[0].id).toBe(interaction.id);
        expect(spawnedProcesses[0].env.INTERACTION_ID).toBe(interaction.id);
        expect(spawnedProcesses[0].env.ENABLE_TOOLS).toBe('true');
      } finally {
        ProcessManager.prototype.startProcess = originalStartProcess;
        await wakeProcessor.stop();
      }
    });

    test('passes worktree context to process', async () => {
      const spawnedProcesses: any[] = [];
      const originalStartProcess = ProcessManager.prototype.startProcess;
      ProcessManager.prototype.startProcess = async function(config: any) {
        spawnedProcesses.push(config);
        return { id: config.id, pid: 12345 };
      };

      try {
        await wakeProcessor.start();

        // Create interaction with worktree
        const interaction = Interaction.create({
          source: 'user',
          type: InteractionType.ACTION,
          metadata: {
            worktreeContext: {
              worktreeId: 'wt-123',
              worktreePath: '/path/to/worktree',
              branch: 'feature/test'
            }
          }
        });
        await interactionStore.create(interaction);

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(spawnedProcesses).toHaveLength(1);
        expect(spawnedProcesses[0].cwd).toBe('/path/to/worktree');
      } finally {
        ProcessManager.prototype.startProcess = originalStartProcess;
        await wakeProcessor.stop();
      }
    });

    test('does not spawn duplicate processes', async () => {
      const spawnedProcesses: any[] = [];
      const spawnedIds = new Set<string>();
      
      const originalStartProcess = ProcessManager.prototype.startProcess;
      ProcessManager.prototype.startProcess = async function(config: any) {
        if (!spawnedIds.has(config.id)) {
          spawnedProcesses.push(config);
          spawnedIds.add(config.id);
        }
        return { id: config.id, pid: 12345 };
      };

      // Mock getProcess to return existing process after first spawn
      const originalGetProcess = ProcessManager.prototype.getProcess;
      ProcessManager.prototype.getProcess = function(id: string) {
        return spawnedIds.has(id) ? { id, pid: 12345, status: 'running' } : null;
      };

      try {
        await wakeProcessor.start();

        const interaction = Interaction.create({
          source: 'user',
          type: InteractionType.QUERY
        });
        await interactionStore.create(interaction);

        // Wait for first spawn
        await new Promise(resolve => setTimeout(resolve, 100));

        // Add user message (should check for existing process)
        const message = Message.create({
          interactionId: interaction.id,
          role: 'user',
          content: 'Another message'
        });
        await messageStore.addMessage(message);

        await new Promise(resolve => setTimeout(resolve, 100));

        // Should only spawn once
        expect(spawnedProcesses).toHaveLength(1);
        expect(spawnedIds.size).toBe(1);
      } finally {
        ProcessManager.prototype.startProcess = originalStartProcess;
        ProcessManager.prototype.getProcess = originalGetProcess;
        await wakeProcessor.stop();
      }
    });
  });

  describe('Process monitoring', () => {
    test('tracks active processes', () => {
      // Create mock processes
      const mockProcesses = [
        { id: 'int-1', pid: 1001, status: 'running' },
        { id: 'int-2', pid: 1002, status: 'running' }
      ];

      const originalGetAll = ProcessManager.prototype.getAllProcesses;
      ProcessManager.prototype.getAllProcesses = function() {
        return mockProcesses;
      };

      try {
        const activeProcesses = wakeProcessor.getActiveProcesses();
        expect(activeProcesses).toHaveLength(2);
        expect(activeProcesses).toEqual(mockProcesses);
      } finally {
        ProcessManager.prototype.getAllProcesses = originalGetAll;
      }
    });

    test('gets process details', async () => {
      const mockProcess = {
        id: 'int-123',
        pid: 12345,
        status: 'running',
        startTime: new Date(),
        memoryUsage: 50 * 1024 * 1024 // 50MB
      };

      const originalGetDetails = ProcessManager.prototype.getProcessDetails;
      ProcessManager.prototype.getProcessDetails = async function(id: string) {
        if (id === 'int-123') return mockProcess;
        return null;
      };

      try {
        const details = await wakeProcessor.getProcessDetails('int-123');
        expect(details).toEqual(mockProcess);
      } finally {
        ProcessManager.prototype.getProcessDetails = originalGetDetails;
      }
    });

    test('restarts process', async () => {
      let restartCalled = false;
      let restartedId: string | undefined;

      const originalRestart = ProcessManager.prototype.restartProcess;
      ProcessManager.prototype.restartProcess = async function(id: string) {
        restartCalled = true;
        restartedId = id;
        return { id, pid: 99999 };
      };

      try {
        await wakeProcessor.restartProcess('int-456');
        expect(restartCalled).toBe(true);
        expect(restartedId).toBe('int-456');
      } finally {
        ProcessManager.prototype.restartProcess = originalRestart;
      }
    });

    test('stops process and clears metadata', async () => {
      let stopCalled = false;
      const originalStop = ProcessManager.prototype.stopProcess;
      ProcessManager.prototype.stopProcess = async function(id: string) {
        stopCalled = true;
      };

      try {
        // Create interaction with process ID
        const interaction = Interaction.create({
          source: 'user',
          type: InteractionType.QUERY,
          metadata: { wakeProcessId: 'process-789' }
        });
        await interactionStore.create(interaction);

        await wakeProcessor.stopProcess(interaction.id);

        expect(stopCalled).toBe(true);
        
        // Process ID should be cleared
        const updated = interactionStore.get(interaction.id);
        expect(updated?.metadata.wakeProcessId).toBeUndefined();
      } finally {
        ProcessManager.prototype.stopProcess = originalStop;
      }
    });
  });

  describe('Process event handling', () => {
    test('logs process lifecycle events', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      
      console.log = (...args: any[]) => logs.push(args.join(' '));
      console.error = (...args: any[]) => logs.push(args.join(' '));
      console.warn = (...args: any[]) => logs.push(args.join(' '));

      try {
        await wakeProcessor.start();

        // Simulate process events
        const processManager = (wakeProcessor as any).processManager;
        
        processManager.emit('process:started', { id: 'test-1', pid: 1001 });
        processManager.emit('process:restarted', { id: 'test-1', pid: 1002, restartCount: 1 });
        processManager.emit('process:failed', { id: 'test-1', error: new Error('Test error'), willRestart: true });
        processManager.emit('process:failed', { id: 'test-1', error: new Error('Final error'), willRestart: false });
        processManager.emit('process:healthy', { id: 'test-1' });
        processManager.emit('process:unhealthy', { id: 'test-1', error: new Error('Unhealthy') });

        expect(logs.some(log => log.includes('Process started: test-1 (PID: 1001)'))).toBe(true);
        expect(logs.some(log => log.includes('Process restarted: test-1 (PID: 1002, attempt 1)'))).toBe(true);
        expect(logs.some(log => log.includes('Process failed: test-1') && log.includes('Test error'))).toBe(true);
        expect(logs.some(log => log.includes('Process test-1 has exceeded max restarts'))).toBe(true);
        expect(logs.some(log => log.includes('Process healthy: test-1'))).toBe(true);
        expect(logs.some(log => log.includes('Process unhealthy: test-1'))).toBe(true);
      } finally {
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
        await wakeProcessor.stop();
      }
    });
  });

  describe('Cleanup', () => {
    test('stops all processes on shutdown', async () => {
      let stopAllCalled = false;
      const originalStopAll = ProcessManager.prototype.stopAll;
      ProcessManager.prototype.stopAll = async function() {
        stopAllCalled = true;
      };

      try {
        await wakeProcessor.start();
        await wakeProcessor.stop();

        expect(stopAllCalled).toBe(true);
      } finally {
        ProcessManager.prototype.stopAll = originalStopAll;
      }
    });
  });
});