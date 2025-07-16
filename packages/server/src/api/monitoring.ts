import { Hono } from 'hono';
import type { WakeProcessor } from '../agents/wake-processor';

export function createMonitoringRoutes(wakeProcessor: WakeProcessor) {
  const app = new Hono();
  
  // Health check endpoint
  app.get('/health', (c) => {
    const processCount = wakeProcessor.getProcessCount();
    const processes = wakeProcessor.getAllProcesses();
    const healthyCount = processes.filter(p => p.isHealthy).length;
    
    const status = {
      status: processCount === healthyCount ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      processes: {
        total: processCount,
        healthy: healthyCount,
        unhealthy: processCount - healthyCount
      }
    };
    
    return c.json(status);
  });
  
  // Process list endpoint
  app.get('/processes', (c) => {
    const processes = wakeProcessor.getAllProcesses();
    
    const processData = processes.map(p => ({
      id: p.id,
      pid: p.subprocess.pid,
      startedAt: p.startedAt.toISOString(),
      restartCount: p.restartCount,
      isHealthy: p.isHealthy,
      lastHealthCheck: p.lastHealthCheck?.toISOString(),
      uptime: Date.now() - p.startedAt.getTime()
    }));
    
    return c.json({
      count: processes.length,
      processes: processData
    });
  });
  
  // Individual process info
  app.get('/processes/:id', (c) => {
    const id = c.req.param('id');
    const processInfo = wakeProcessor.getProcessInfo(id);
    
    if (!processInfo) {
      return c.json({ error: 'Process not found' }, 404);
    }
    
    return c.json({
      id: processInfo.id,
      pid: processInfo.subprocess.pid,
      startedAt: processInfo.startedAt.toISOString(),
      restartCount: processInfo.restartCount,
      isHealthy: processInfo.isHealthy,
      lastHealthCheck: processInfo.lastHealthCheck?.toISOString(),
      uptime: Date.now() - processInfo.startedAt.getTime(),
      config: {
        cwd: processInfo.config.cwd,
        maxRestarts: processInfo.config.maxRestarts,
        healthCheckInterval: processInfo.config.healthCheckInterval
      }
    });
  });
  
  // System metrics
  app.get('/metrics', (c) => {
    const processes = wakeProcessor.getAllProcesses();
    const now = Date.now();
    
    // Calculate metrics
    const uptimes = processes.map(p => now - p.startedAt.getTime());
    const avgUptime = uptimes.length > 0 ? uptimes.reduce((a, b) => a + b, 0) / uptimes.length : 0;
    const totalRestarts = processes.reduce((sum, p) => sum + p.restartCount, 0);
    
    return c.json({
      timestamp: new Date().toISOString(),
      processes: {
        count: processes.length,
        healthy: processes.filter(p => p.isHealthy).length,
        averageUptime: Math.round(avgUptime),
        totalRestarts
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime() * 1000,
        memoryUsage: process.memoryUsage()
      }
    });
  });
  
  return app;
}