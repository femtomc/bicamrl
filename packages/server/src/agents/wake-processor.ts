import { InteractionStore } from '../interaction/store';
import { MessageStore } from '../message/store';
import { LLMService } from '../llm/service';
import { ProcessManager, type ProcessConfig } from '../process/manager';
import { resolve } from 'path';
import type { MessageEvent } from '../message/store';
import type { InteractionEvent } from '../interaction/store';

/**
 * WakeProcessor V2 - Message-based processing
 * 
 * Key changes:
 * - Listens to message events instead of interaction events
 * - One process per interaction (not per message)
 * - Processes handle multiple messages in a conversation
 */
export class WakeProcessor {
  private interactionStore: InteractionStore;
  private messageStore: MessageStore;
  private llmService: LLMService;
  private enableTools: boolean;
  private processManager: ProcessManager;
  private isRunning: boolean = false;
  private unsubscribeInteraction?: () => void;
  private unsubscribeMessage?: () => void;
  public serverPort?: number; // Port that Wake processes should connect to

  constructor(
    interactionStore: InteractionStore,
    messageStore: MessageStore,
    llmService: LLMService,
    enableTools: boolean = false
  ) {
    this.interactionStore = interactionStore;
    this.messageStore = messageStore;
    this.llmService = llmService;
    this.enableTools = enableTools;
    
    // Initialize process manager with sensible defaults
    this.processManager = new ProcessManager({
      maxProcesses: 20,
      maxMemoryPerProcess: 256 * 1024 * 1024, // 256MB per process
      healthCheckInterval: 30000, // 30s
      restartDelay: 2000, // 2s
      maxRestarts: 3
    });
    
    // Listen to process events
    this.setupProcessEventHandlers();
  }

  private setupProcessEventHandlers(): void {
    this.processManager.on('process:started', ({ id, pid }) => {
      console.log(`[WakeProcessor] Process started: ${id} (PID: ${pid})`);
    });
    
    this.processManager.on('process:restarted', ({ id, pid, restartCount }) => {
      console.log(`[WakeProcessor] Process restarted: ${id} (PID: ${pid}, attempt ${restartCount})`);
    });
    
    this.processManager.on('process:failed', ({ id, error, willRestart }) => {
      console.error(`[WakeProcessor] Process failed: ${id}`, error);
      if (!willRestart) {
        console.error(`[WakeProcessor] Process ${id} has exceeded max restarts`);
      }
    });
    
    this.processManager.on('process:healthy', ({ id }) => {
      console.log(`[WakeProcessor] Process healthy: ${id}`);
    });
    
    this.processManager.on('process:unhealthy', ({ id, error }) => {
      console.warn(`[WakeProcessor] Process unhealthy: ${id}`, error);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log('[WakeProcessor] Starting...');

    // Listen to new interactions to spawn processes
    this.unsubscribeInteraction = this.interactionStore.subscribe(async (event: InteractionEvent) => {
      console.log(`[WakeProcessor] Received event: ${event.type}`);
      if (event.type === 'interaction:created') {
        console.log(`[WakeProcessor] Spawning for new interaction: ${event.data.interaction.id}`);
        await this.spawnWakeProcess(event.data.interaction.id);
      }
    });

    // Listen to new messages to notify existing processes
    this.unsubscribeMessage = this.messageStore.subscribe(async (event: MessageEvent) => {
      if (event.type === 'message:added' && event.data.message.role === 'user') {
        console.log(`[WakeProcessor] User message added for interaction: ${event.data.interactionId}`);
        // Check if process exists for this interaction
        const process = this.processManager.getProcess(event.data.interactionId);
        if (!process) {
          console.log(`[WakeProcessor] No process found, spawning new one`);
          // Spawn a new process if needed
          await this.spawnWakeProcess(event.data.interactionId);
        } else {
          console.log(`[WakeProcessor] Process already exists for interaction`);
        }
        // Process will pick up the new message via its own subscription
      }
    });

    console.log('[WakeProcessor] Started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[WakeProcessor] Stopping...');
    this.isRunning = false;

    if (this.unsubscribeInteraction) {
      this.unsubscribeInteraction();
    }
    if (this.unsubscribeMessage) {
      this.unsubscribeMessage();
    }

    await this.processManager.stopAll();
    console.log('[WakeProcessor] Stopped');
  }

  private async spawnWakeProcess(interactionId: string): Promise<void> {
    try {
      // Check if process already exists
      if (this.processManager.getProcess(interactionId)) {
        console.log(`[WakeProcessor] Process already exists for interaction ${interactionId}`);
        return;
      }

      const interaction = this.interactionStore.get(interactionId);
      if (!interaction) {
        console.error(`[WakeProcessor] Interaction ${interactionId} not found`);
        return;
      }

      // Update interaction with process ID
      await this.interactionStore.updateMetadata(interactionId, {
        wakeProcessId: interactionId
      });

      console.log(`[WakeProcessor] Spawning Wake process for interaction ${interactionId}`);
      
      const scriptPath = resolve(__dirname, './wake-process.ts');
      
      const config: ProcessConfig = {
        id: interactionId,
        script: scriptPath,
        args: [interactionId],
        env: {
          ...process.env,
          INTERACTION_ID: interactionId,
          ENABLE_TOOLS: String(this.enableTools),
          LLM_PROVIDER: this.llmService.constructor.name,
          PORT: String(this.serverPort || process.env.PORT || 3456),
          BICAMRL_SERVER_URL: `http://localhost:${this.serverPort || process.env.PORT || 3456}`
        },
        cwd: interaction.metadata.worktreeContext?.worktreePath || process.cwd(),
        // Resource limits
        maxMemory: 256 * 1024 * 1024, // 256MB
        timeout: 5 * 60 * 1000, // 5 minutes
        // Health check
        healthCheck: async () => {
          // Could check if process is responsive
          return { healthy: true };
        }
      };

      await this.processManager.startProcess(config);
      
    } catch (error) {
      console.error(`[WakeProcessor] Failed to spawn process for ${interactionId}:`, error);
      
      // Update interaction to show error
      await this.interactionStore.updateMetadata(interactionId, {
        wakeProcessId: undefined
      });
    }
  }

  // Methods for external monitoring
  public getActiveProcesses() {
    return this.processManager.getAllProcesses();
  }

  public async getProcessDetails(interactionId: string) {
    return this.processManager.getProcessDetails(interactionId);
  }

  public async restartProcess(interactionId: string) {
    return this.processManager.restartProcess(interactionId);
  }

  public async stopProcess(interactionId: string) {
    await this.processManager.stopProcess(interactionId);
    
    // Clear process ID from interaction
    await this.interactionStore.updateMetadata(interactionId, {
      wakeProcessId: undefined
    });
  }
}