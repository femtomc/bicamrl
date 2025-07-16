import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ProcessManager } from '../manager';
import { setTimeout } from 'timers/promises';

describe('ProcessManager', () => {
  let manager: ProcessManager;
  
  beforeEach(() => {
    manager = new ProcessManager({
      maxProcesses: 5,
      healthCheckInterval: 1000,
      restartDelay: 100,
      maxRestarts: 2
    });
  });
  
  afterEach(async () => {
    await manager.shutdown();
  });
  
  test('should spawn a process successfully', async () => {
    const id = await manager.spawn({
      id: 'test-1',
      cmd: ['echo', 'hello'],
      cwd: process.cwd()
    });
    
    expect(id).toBe('test-1');
    expect(manager.getProcessCount()).toBe(1);
    
    const processInfo = manager.getProcess('test-1');
    expect(processInfo).toBeDefined();
    expect(processInfo?.isHealthy).toBe(true);
  });
  
  test('should enforce process limit', async () => {
    // Spawn max processes
    for (let i = 0; i < 5; i++) {
      await manager.spawn({
        id: `test-${i}`,
        cmd: ['sleep', '10'],
        cwd: process.cwd()
      });
    }
    
    // Try to spawn one more
    await expect(manager.spawn({
      id: 'test-overflow',
      cmd: ['echo', 'should fail'],
      cwd: process.cwd()
    })).rejects.toThrow('Process limit reached');
  });
  
  test('should restart failed processes', async () => {
    let restartCount = 0;
    
    manager.on('process:restarted', () => {
      restartCount++;
    });
    
    // Spawn a process that will exit immediately
    await manager.spawn({
      id: 'test-restart',
      cmd: ['bash', '-c', 'exit 1'],
      cwd: process.cwd(),
      maxRestarts: 2,
      restartDelay: 50
    });
    
    // Wait for restarts
    await setTimeout(300);
    
    expect(restartCount).toBeGreaterThan(0);
    expect(restartCount).toBeLessThanOrEqual(2);
  });
  
  test('should stop restarting after max attempts', async () => {
    let failedEmitted = false;
    
    manager.on('process:failed', ({ reason }) => {
      if (reason === 'max_restarts_exceeded') {
        failedEmitted = true;
      }
    });
    
    await manager.spawn({
      id: 'test-max-restarts',
      cmd: ['bash', '-c', 'exit 1'],
      cwd: process.cwd(),
      maxRestarts: 1,
      restartDelay: 50
    });
    
    // Wait for process to fail completely
    await setTimeout(200);
    
    expect(failedEmitted).toBe(true);
    expect(manager.getProcess('test-max-restarts')).toBeUndefined();
  });
  
  test('should kill processes on shutdown', async () => {
    // Spawn multiple processes
    await manager.spawn({
      id: 'test-shutdown-1',
      cmd: ['sleep', '10'],
      cwd: process.cwd()
    });
    
    await manager.spawn({
      id: 'test-shutdown-2',
      cmd: ['sleep', '10'],
      cwd: process.cwd()
    });
    
    expect(manager.getProcessCount()).toBe(2);
    
    // Shutdown
    await manager.shutdown();
    
    expect(manager.getProcessCount()).toBe(0);
  });
  
  test('should emit events for process lifecycle', async () => {
    const events: string[] = [];
    
    manager.on('process:started', () => events.push('started'));
    manager.on('process:exited', () => events.push('exited'));
    
    await manager.spawn({
      id: 'test-events',
      cmd: ['echo', 'test'],
      cwd: process.cwd()
    });
    
    // Wait for process to complete
    await setTimeout(100);
    
    expect(events).toContain('started');
    expect(events).toContain('exited');
  });
  
  test('should perform health checks', async () => {
    let healthCheckCount = 0;
    
    manager.on('process:unhealthy', () => {
      healthCheckCount++;
    });
    
    // Spawn a process
    await manager.spawn({
      id: 'test-health',
      cmd: ['sleep', '5'],
      cwd: process.cwd(),
      healthCheckInterval: 100
    });
    
    const processInfo = manager.getProcess('test-health');
    expect(processInfo?.isHealthy).toBe(true);
    
    // TODO: Add custom health check logic that can fail
    // For now, just verify health checks are running
    await setTimeout(250);
    
    const updatedInfo = manager.getProcess('test-health');
    expect(updatedInfo?.lastHealthCheck).toBeDefined();
  });
  
  test('should handle concurrent process operations', async () => {
    const promises = [];
    
    // Spawn multiple processes concurrently
    for (let i = 0; i < 3; i++) {
      promises.push(manager.spawn({
        id: `concurrent-${i}`,
        cmd: ['echo', `test-${i}`],
        cwd: process.cwd()
      }));
    }
    
    await Promise.all(promises);
    expect(manager.getProcessCount()).toBe(3);
    
    // Kill them concurrently
    const killPromises = [];
    for (let i = 0; i < 3; i++) {
      killPromises.push(manager.kill(`concurrent-${i}`));
    }
    
    await Promise.all(killPromises);
    expect(manager.getProcessCount()).toBe(0);
  });
});