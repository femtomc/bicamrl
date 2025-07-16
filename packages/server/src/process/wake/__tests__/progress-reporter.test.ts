import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { ProgressReporter } from '../progress-reporter';
import { setTimeout } from 'timers/promises';

describe('ProgressReporter', () => {
  let reporter: ProgressReporter;
  let onUpdateMock: any;
  let updateCalls: any[];
  
  beforeEach(() => {
    updateCalls = [];
    onUpdateMock = mock(async (metadata: any) => {
      updateCalls.push(metadata);
    });
    reporter = new ProgressReporter(onUpdateMock);
  });
  
  test('should start progress reporting', async () => {
    reporter.start();
    
    // Wait for a few updates
    await setTimeout(250);
    
    reporter.stop();
    
    // Should have multiple updates
    expect(updateCalls.length).toBeGreaterThan(1);
    
    // Check update format
    const firstUpdate = updateCalls[0];
    expect(firstUpdate.currentAction).toMatch(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Thinking\.\.\. \d\.\d+s$/);
  });
  
  test('should stop progress reporting', async () => {
    reporter.start();
    await setTimeout(150);
    
    const countBeforeStop = updateCalls.length;
    reporter.stop();
    
    await setTimeout(150);
    
    // No new updates after stop
    expect(updateCalls.length).toBe(countBeforeStop);
  });
  
  test('should update with token counts', async () => {
    reporter.start();
    await setTimeout(50);
    
    await reporter.updateWithTokens(100, 50);
    
    const lastUpdate = updateCalls[updateCalls.length - 1];
    expect(lastUpdate.currentAction).toMatch(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Thinking\.\.\. \d\.\d+s \(100 → 50 tokens\)$/);
    
    reporter.stop();
  });
  
  test('should use rotating symbols', async () => {
    reporter.start();
    
    // Collect updates for a full rotation
    await setTimeout(1100); // 11 updates at 100ms each
    
    reporter.stop();
    
    // Extract symbols from updates
    const symbols = updateCalls.map(u => u.currentAction.charAt(0));
    const uniqueSymbols = new Set(symbols);
    
    // Should have multiple different symbols
    expect(uniqueSymbols.size).toBeGreaterThan(5);
  });
  
  test('should handle update errors gracefully', async () => {
    const errorOnUpdate = mock(async () => {
      throw new Error('Update failed');
    });
    
    reporter = new ProgressReporter(errorOnUpdate);
    
    // Should not throw
    reporter.start();
    await setTimeout(150);
    reporter.stop();
    
    // Error handler should have been called
    expect(errorOnUpdate).toHaveBeenCalled();
  });
  
  test('should calculate elapsed time correctly', async () => {
    reporter.start();
    
    await setTimeout(1050); // Just over 1 second
    
    reporter.stop();
    
    const lastUpdate = updateCalls[updateCalls.length - 1];
    // Should show 1.0s or 1.1s
    expect(lastUpdate.currentAction).toMatch(/1\.[01]s/);
  });
});