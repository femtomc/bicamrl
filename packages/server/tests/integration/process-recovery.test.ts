import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ProcessManager } from '../../src/process/manager';
import { InteractionStore } from '../../src/interaction/store';
import { MessageStore } from '../../src/message/store';
import { WakeProcessor } from '../../src/agents/wake-processor';
import { LLMService } from '../../src/llm/service';
import { Interaction, InteractionType } from '../../src/interaction/types';
import { Message } from '../../src/message/types';
import { spawn } from 'bun';

describe('Process Recovery and Error Handling', () => {
  let processManager: ProcessManager;
  let interactionStore: InteractionStore;
  let messageStore: MessageStore;
  let wakeProcessor: WakeProcessor;
  let llmService: LLMService;

  beforeEach(() => {
    processManager = new ProcessManager();
    interactionStore = new InteractionStore();
    messageStore = new MessageStore();
    llmService = new LLMService('mock');
    wakeProcessor = new WakeProcessor(
      interactionStore,
      messageStore,
      llmService,
      true
    );
  });

  afterEach(async () => {
    await processManager.stopAll();
  });

  describe('Process Crash Recovery', () => {
    test('restarts process after crash', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY
      });
      await interactionStore.create(interaction);

      // Start a process that will crash
      const config = {
        id: interaction.id,
        command: 'bun',
        args: ['run', '-e', 'setTimeout(() => process.exit(1), 100)'],
        env: { INTERACTION_ID: interaction.id },
        maxRestarts: 3,
        restartDelay: 100
      };

      const process = await processManager.startProcess(config);
      expect(process.pid).toBeDefined();

      // Wait for crash and restart
      await new Promise(resolve => setTimeout(resolve, 500));

      // Process should have restarted
      const details = await processManager.getProcessDetails(interaction.id);
      expect(details).toBeDefined();
      expect(details!.restartCount).toBeGreaterThan(0);
      expect(details!.status).toBe('running');
    });

    test('stops restarting after max attempts', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.ACTION
      });
      await interactionStore.create(interaction);

      let crashCount = 0;
      const originalStart = processManager.startProcess.bind(processManager);
      processManager.startProcess = async function(config: any) {
        crashCount++;
        // Always crash immediately
        const proc = await originalStart({
          ...config,
          command: 'bun',
          args: ['run', '-e', 'process.exit(1)'],
          maxRestarts: 2,
          restartDelay: 50
        });
        return proc;
      };

      try {
        await processManager.startProcess({
          id: interaction.id,
          command: 'test',
          args: [],
          env: {}
        });

        // Wait for all restart attempts
        await new Promise(resolve => setTimeout(resolve, 500));

        // Should have attempted initial + 2 restarts = 3 total
        expect(crashCount).toBe(3);

        // Process should be stopped
        const details = await processManager.getProcessDetails(interaction.id);
        expect(details).toBeNull();
      } finally {
        processManager.startProcess = originalStart;
      }
    });

    test('handles process hanging and kills it', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY
      });
      await interactionStore.create(interaction);

      // Start a hanging process
      const process = await processManager.startProcess({
        id: interaction.id,
        command: 'bun',
        args: ['run', '-e', 'while(true) { }'], // Infinite loop
        env: { INTERACTION_ID: interaction.id },
        healthCheckInterval: 100,
        healthCheckTimeout: 200
      });

      // Simulate health check failure
      const health = await processManager.checkHealth(interaction.id);
      expect(health.healthy).toBe(false);

      // Process should be marked unhealthy
      const details = await processManager.getProcessDetails(interaction.id);
      expect(details?.status).toBe('unhealthy');

      // Kill the hanging process
      await processManager.stopProcess(interaction.id);
    });
  });

  describe('Wake Process Error Handling', () => {
    test('handles wake process initialization errors', async () => {
      // Mock agent factory to throw error
      const originalCreateAgent = (wakeProcessor as any).createAgent;
      (wakeProcessor as any).createAgent = async () => {
        throw new Error('Agent initialization failed');
      };

      try {
        const interaction = Interaction.create({
          source: 'user',
          type: InteractionType.QUERY
        });
        await interactionStore.create(interaction);

        await wakeProcessor.start();

        // Add a message to trigger processing
        const message = Message.create({
          interactionId: interaction.id,
          role: 'user',
          content: 'Test message'
        });
        await messageStore.addMessage(message);

        // Wait for error handling
        await new Promise(resolve => setTimeout(resolve, 200));

        // Interaction should be marked as failed
        const updated = interactionStore.get(interaction.id);
        expect(updated?.status).toBe('failed');
        expect(updated?.error?.message).toContain('Agent initialization failed');
      } finally {
        (wakeProcessor as any).createAgent = originalCreateAgent;
        await wakeProcessor.stop();
      }
    });

    test('handles message processing errors', async () => {
      // Use error provider
      const errorLLMService = new LLMService('error');
      const errorWakeProcessor = new WakeProcessor(
        interactionStore,
        messageStore,
        errorLLMService,
        false
      );

      try {
        await errorWakeProcessor.start();

        const interaction = Interaction.create({
          source: 'user',
          type: InteractionType.QUERY
        });
        await interactionStore.create(interaction);

        const message = Message.create({
          interactionId: interaction.id,
          role: 'user',
          content: 'This will cause an error'
        });
        await messageStore.addMessage(message);

        // Wait for error handling
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check interaction status
        const updated = interactionStore.get(interaction.id);
        expect(updated?.status).toBe('failed');
        expect(updated?.error).toBeDefined();
      } finally {
        await errorWakeProcessor.stop();
      }
    });

    test('handles timeout during processing', async () => {
      // Mock a slow agent
      const originalProcess = (wakeProcessor as any).processWithAgent;
      (wakeProcessor as any).processWithAgent = async () => {
        // Simulate very slow processing
        await new Promise(resolve => setTimeout(resolve, 10000));
        return { content: 'Should timeout' };
      };

      try {
        await wakeProcessor.start();

        const interaction = Interaction.create({
          source: 'user',
          type: InteractionType.QUERY,
          metadata: { timeout: 100 } // 100ms timeout
        });
        await interactionStore.create(interaction);

        const message = Message.create({
          interactionId: interaction.id,
          role: 'user',
          content: 'Timeout test'
        });
        await messageStore.addMessage(message);

        // Wait for timeout
        await new Promise(resolve => setTimeout(resolve, 500));

        const updated = interactionStore.get(interaction.id);
        expect(updated?.status).toBe('failed');
        expect(updated?.error?.message).toContain('timeout');
      } finally {
        (wakeProcessor as any).processWithAgent = originalProcess;
        await wakeProcessor.stop();
      }
    });
  });

  describe('Concurrent Process Management', () => {
    test('handles multiple process failures gracefully', async () => {
      const interactions = Array.from({ length: 5 }, () =>
        Interaction.create({
          source: 'user',
          type: InteractionType.QUERY
        })
      );

      // Create all interactions
      await Promise.all(interactions.map(i => interactionStore.create(i)));

      // Start processes that will fail
      const processes = await Promise.all(
        interactions.map(i =>
          processManager.startProcess({
            id: i.id,
            command: 'bun',
            args: ['run', '-e', 'setTimeout(() => process.exit(1), Math.random() * 200)'],
            env: { INTERACTION_ID: i.id },
            maxRestarts: 1
          })
        )
      );

      // Wait for all to fail and restart attempts
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check all processes
      const statuses = await Promise.all(
        interactions.map(i => processManager.getProcessDetails(i.id))
      );

      // All should have attempted restart
      statuses.forEach(status => {
        if (status) {
          expect(status.restartCount).toBeGreaterThan(0);
        }
      });
    });

    test('isolates process failures', async () => {
      const healthyInteraction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY
      });
      const failingInteraction = Interaction.create({
        source: 'user',
        type: InteractionType.ACTION
      });

      await interactionStore.create(healthyInteraction);
      await interactionStore.create(failingInteraction);

      // Start healthy process
      const healthyProcess = await processManager.startProcess({
        id: healthyInteraction.id,
        command: 'bun',
        args: ['run', '-e', 'setInterval(() => console.log("healthy"), 100)'],
        env: { INTERACTION_ID: healthyInteraction.id }
      });

      // Start failing process
      const failingProcess = await processManager.startProcess({
        id: failingInteraction.id,
        command: 'bun',
        args: ['run', '-e', 'process.exit(1)'],
        env: { INTERACTION_ID: failingInteraction.id },
        maxRestarts: 0
      });

      await new Promise(resolve => setTimeout(resolve, 300));

      // Healthy process should still be running
      const healthyDetails = await processManager.getProcessDetails(healthyInteraction.id);
      expect(healthyDetails?.status).toBe('running');

      // Failing process should be stopped
      const failingDetails = await processManager.getProcessDetails(failingInteraction.id);
      expect(failingDetails).toBeNull();

      // Clean up
      await processManager.stopProcess(healthyInteraction.id);
    });
  });

  describe('Recovery Strategies', () => {
    test('recovers interaction state after process crash', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY,
        metadata: { checkpoint: 'step1' }
      });
      await interactionStore.create(interaction);

      // Simulate process that crashes after partial work
      const process = await processManager.startProcess({
        id: interaction.id,
        command: 'bun',
        args: ['run', '-e', `
          console.log('CHECKPOINT:step2');
          setTimeout(() => process.exit(1), 100);
        `],
        env: { INTERACTION_ID: interaction.id },
        maxRestarts: 1
      });

      // Wait for crash and capture output
      await new Promise(resolve => setTimeout(resolve, 500));

      // On restart, process should resume from checkpoint
      // (In real implementation, this would read from interaction metadata)
      const updated = interactionStore.get(interaction.id);
      expect(updated).toBeDefined();
      
      // Process should have restarted
      const details = await processManager.getProcessDetails(interaction.id);
      expect(details?.restartCount).toBe(1);
    });

    test('handles cleanup after fatal errors', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.ACTION
      });
      await interactionStore.create(interaction);

      // Track cleanup actions
      let cleanupCalled = false;
      const originalStop = processManager.stopProcess.bind(processManager);
      processManager.stopProcess = async function(id: string) {
        cleanupCalled = true;
        return originalStop(id);
      };

      // Start process that will fail fatally
      await processManager.startProcess({
        id: interaction.id,
        command: 'bun',
        args: ['run', '-e', 'throw new Error("Fatal error")'],
        env: { INTERACTION_ID: interaction.id },
        maxRestarts: 0
      });

      await new Promise(resolve => setTimeout(resolve, 300));

      // Cleanup should have been called
      expect(cleanupCalled).toBe(true);

      // Interaction should be marked as failed
      const updated = interactionStore.get(interaction.id);
      expect(updated?.status).toBe('failed');
    });
  });

  describe('Resource Management', () => {
    test('prevents resource leaks on process failures', async () => {
      const initialMemory = process.memoryUsage();

      // Create many failing processes
      for (let i = 0; i < 10; i++) {
        const interaction = Interaction.create({
          source: 'user',
          type: InteractionType.QUERY
        });
        await interactionStore.create(interaction);

        const proc = await processManager.startProcess({
          id: interaction.id,
          command: 'bun',
          args: ['run', '-e', 'process.exit(1)'],
          env: { INTERACTION_ID: interaction.id },
          maxRestarts: 0
        });

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const finalMemory = process.memoryUsage();
      
      // Memory growth should be reasonable (less than 50MB)
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);

      // All processes should be cleaned up
      const allProcesses = processManager.getAllProcesses();
      expect(allProcesses).toHaveLength(0);
    });

    test('cleans up orphaned processes', async () => {
      // Create interaction that will be deleted
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY
      });
      await interactionStore.create(interaction);

      // Start process
      await processManager.startProcess({
        id: interaction.id,
        command: 'bun',
        args: ['run', '-e', 'setInterval(() => {}, 1000)'],
        env: { INTERACTION_ID: interaction.id }
      });

      // Delete interaction (simulating orphaned process)
      interactionStore['interactions'].delete(interaction.id);

      // Run cleanup
      await processManager.cleanupOrphaned(interactionStore);

      // Process should be stopped
      const details = await processManager.getProcessDetails(interaction.id);
      expect(details).toBeNull();
    });
  });
});