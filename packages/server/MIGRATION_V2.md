# Migration Guide: WakeProcessor V2

## Overview

WakeProcessor V2 introduces robust process management with automatic recovery, health monitoring, and resource limits. This addresses the critical issue where crashed Wake processes would leave interactions in limbo.

## Key Improvements

1. **Automatic Process Recovery**
   - Processes that crash are automatically restarted (up to 3 times by default)
   - Configurable restart delay and max attempts
   - Failed processes update interaction state appropriately

2. **Health Monitoring**
   - Regular health checks on all running processes
   - Exposed monitoring endpoints for observability
   - Process lifecycle events for debugging

3. **Resource Limits**
   - Maximum concurrent processes (default: 20)
   - Memory limits per process (default: 256MB)
   - Prevents resource exhaustion

4. **Graceful Shutdown**
   - Clean process termination on server shutdown
   - No orphaned processes

## Migration Steps

### 1. Update imports in your server entry point:

```typescript
// Old
import { WakeProcessor } from './agents/wake-processor';

// New
import { WakeProcessorV2 } from './agents/wake-processor-v2';
```

### 2. Replace WakeProcessor instantiation:

```typescript
// Old
const wakeProcessor = new WakeProcessor(interactionStore, llmService, enableTools);

// New
const wakeProcessor = new WakeProcessorV2(interactionStore, llmService, enableTools);
```

### 3. Add monitoring routes (optional but recommended):

```typescript
import { createMonitoringRoutes } from './api/monitoring';

// Add monitoring endpoints
const monitoringRoutes = createMonitoringRoutes(wakeProcessor);
app.route('/monitoring', monitoringRoutes);
```

### 4. Add graceful shutdown handlers:

```typescript
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await wakeProcessor.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await wakeProcessor.stop();
  process.exit(0);
});
```

## New Monitoring Endpoints

- `GET /monitoring/health` - Overall system health
- `GET /monitoring/processes` - List all running processes
- `GET /monitoring/processes/:id` - Individual process details
- `GET /monitoring/metrics` - System and process metrics

## Configuration Options

The ProcessManager accepts these options:

```typescript
{
  maxProcesses: 20,              // Maximum concurrent processes
  maxMemoryPerProcess: 256MB,    // Memory limit per process
  healthCheckInterval: 30000,    // Health check interval (ms)
  restartDelay: 2000,           // Delay before restart (ms)
  maxRestarts: 3                // Max restart attempts
}
```

## Breaking Changes

- None! WakeProcessorV2 maintains the same public API as V1
- The only changes are internal improvements

## Testing

Run the ProcessManager tests to verify the new functionality:

```bash
bun test src/process/__tests__/manager.test.ts
```

## Rollback Plan

If you need to rollback:

1. Change imports back to `WakeProcessor`
2. Remove monitoring routes
3. Remove graceful shutdown handlers

The old processor will continue to work but without the recovery features.