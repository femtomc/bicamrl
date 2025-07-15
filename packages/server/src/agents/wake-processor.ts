import { spawn, type Subprocess } from 'bun';
import { InteractionStore } from '../interaction/store';
import { LLMService } from '../llm/service';
import { resolve } from 'path';

/**
 * WakeProcessor - Spawns wake processes for interactions
 * 
 * This processor:
 * 1. Monitors for new interactions via store events
 * 2. Spawns a new wake-process.ts subprocess for each
 * 3. Sets the subprocess working directory to the worktree
 * 4. Tracks running processes
 */
export class WakeProcessor {
  private interactionStore: InteractionStore;
  private llmService: LLMService;
  private enableTools: boolean;
  private isRunning: boolean = false;
  private runningProcesses: Map<string, Subprocess> = new Map();
  private processedInteractions: Set<string> = new Set();

  constructor(
    interactionStore: InteractionStore,
    llmService: LLMService,
    enableTools: boolean = false
  ) {
    this.interactionStore = interactionStore;
    this.llmService = llmService;
    this.enableTools = enableTools;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    console.log('[WakeProcessor] Starting wake processor');
    
    // Clean up on exit
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    
    // Subscribe to interaction events
    const unsubscribe = this.interactionStore.subscribe(async (event) => {
      if (event.type === 'interaction_created') {
        const interaction = event.data.interaction;
        
        // Check if we should process this interaction
        if (this.shouldProcess(interaction)) {
          await this.spawnWakeProcess(interaction);
        }
      }
    });
    
    // Keep running
    while (this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    unsubscribe();
  }

  stop(): void {
    this.isRunning = false;
    this.cleanup();
  }

  private cleanup(): void {
    console.log('[WakeProcessor] Cleaning up running processes...');
    for (const [id, proc] of this.runningProcesses) {
      console.log(`[WakeProcessor] Killing process for interaction ${id}`);
      proc.kill();
    }
    this.runningProcesses.clear();
  }

  private shouldProcess(interaction: any): boolean {
    // Don't process if already being handled
    if (this.processedInteractions.has(interaction.id) || 
        this.runningProcesses.has(interaction.id)) {
      return false;
    }
    
    // Process queries/actions from users that haven't been processed
    if (interaction.source !== 'user') return false;
    if (interaction.type !== 'query' && interaction.type !== 'action') return false;
    
    // Check if already has an assistant response
    const hasAssistantResponse = interaction.content.some(
      (msg: any) => msg.role === 'assistant'
    );
    
    return !hasAssistantResponse;
  }

  private async spawnWakeProcess(interaction: any): Promise<void> {
    try {
      // Mark as processed
      this.processedInteractions.add(interaction.id);
      
      // Update interaction state to processing
      await this.interactionStore.update(interaction.id, i => 
        i.withState({
          kind: 'processing',
          processor: 'wake',
          startedAt: new Date()
        })
      );
      
      // Determine working directory
      const cwd = interaction.metadata?.worktreeContext?.worktreePath || process.cwd();
      
      // Get the wake-process script path
      const scriptPath = resolve(__dirname, 'wake-process.ts');
      
      console.log(`[WakeProcessor] Spawning wake process for interaction ${interaction.id}`);
      console.log(`[WakeProcessor] Script path: ${scriptPath}`);
      console.log(`[WakeProcessor] Working directory: ${cwd}`);
      
      // Spawn the process directly
      const proc = spawn({
        cmd: ['bun', scriptPath, interaction.id],
        cwd,
        env: {
          ...process.env,
          BICAMRL_SERVER_URL: `http://localhost:${process.env.PORT || 3456}`
        },
        stdout: 'inherit',
        stderr: 'inherit'
      });
      
      // Track the process
      this.runningProcesses.set(interaction.id, proc);
      
      // Monitor process exit
      proc.exited.then((exitCode) => {
        console.log(`[WakeProcessor] Process for interaction ${interaction.id} exited with code ${exitCode}`);
        this.runningProcesses.delete(interaction.id);
      }).catch(err => {
        console.error(`[WakeProcessor] Process error for ${interaction.id}:`, err);
        this.runningProcesses.delete(interaction.id);
      });
      
      console.log(`[WakeProcessor] Process spawned successfully for ${interaction.id}`);
      
    } catch (error) {
      console.error(`[WakeProcessor] Error spawning process for interaction ${interaction.id}:`, error);
      this.processedInteractions.delete(interaction.id); // Allow retry
    }
  }
}