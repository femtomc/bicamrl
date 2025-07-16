import { spawn, type Subprocess } from 'bun';
import { EventEmitter } from 'events';

export interface ProcessConfig {
  id: string;
  script: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  maxMemory?: number;
  timeout?: number;
  healthCheck?: () => Promise<{ healthy: boolean }>;
}

interface ProcessInfo {
  id: string;
  subprocess: Subprocess;
  config: ProcessConfig;
  startedAt: Date;
  restartCount: number;
}

export interface ProcessManagerOptions {
  maxProcesses?: number;
  maxMemoryPerProcess?: number;
  healthCheckInterval?: number;
  restartDelay?: number;
  maxRestarts?: number;
}

/**
 * ProcessManager V2 - Simplified for message-based architecture
 */
export class ProcessManager extends EventEmitter {
  private processes: Map<string, ProcessInfo> = new Map();
  private options: ProcessManagerOptions;

  constructor(options: ProcessManagerOptions = {}) {
    super();
    this.options = options;
  }

  async startProcess(config: ProcessConfig): Promise<void> {
    if (this.processes.has(config.id)) {
      console.log(`[ProcessManager] Process ${config.id} already exists`);
      return;
    }

    const subprocess = spawn({
      cmd: ['bun', 'run', config.script, ...config.args],
      cwd: config.cwd || process.cwd(),
      env: {
        ...process.env,
        ...config.env
      },
      stdout: 'inherit',
      stderr: 'inherit'
    });

    const processInfo: ProcessInfo = {
      id: config.id,
      subprocess,
      config,
      startedAt: new Date(),
      restartCount: 0
    };

    this.processes.set(config.id, processInfo);

    this.emit('process:started', {
      id: config.id,
      pid: subprocess.pid
    });

    // Handle process exit
    subprocess.exited.then(exitCode => {
      this.processes.delete(config.id);
      
      this.emit('process:exited', {
        id: config.id,
        exitCode,
        willRestart: false
      });
    });
  }

  getProcess(id: string): ProcessInfo | undefined {
    return this.processes.get(id);
  }

  async stopProcess(id: string): Promise<void> {
    const processInfo = this.processes.get(id);
    if (!processInfo) {
      return;
    }

    processInfo.subprocess.kill();
    this.processes.delete(id);
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.processes.keys()).map(id => 
      this.stopProcess(id)
    );
    await Promise.all(promises);
  }

  getAllProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values());
  }

  async getProcessDetails(id: string): Promise<any> {
    const processInfo = this.processes.get(id);
    if (!processInfo) {
      return null;
    }

    return {
      id: processInfo.id,
      pid: processInfo.subprocess.pid,
      startedAt: processInfo.startedAt,
      restartCount: processInfo.restartCount,
      uptime: Date.now() - processInfo.startedAt.getTime()
    };
  }

  async restartProcess(id: string): Promise<void> {
    const processInfo = this.processes.get(id);
    if (!processInfo) {
      throw new Error(`Process ${id} not found`);
    }

    const config = processInfo.config;
    await this.stopProcess(id);
    await this.startProcess(config);
  }
}