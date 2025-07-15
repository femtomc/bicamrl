#!/usr/bin/env bun
/**
 * Load test to verify SSE and caching optimizations under stress
 */

import { performance } from 'perf_hooks';

interface LoadTestResult {
  totalClients: number;
  duration: number;
  successfulConnections: number;
  failedConnections: number;
  messagesReceived: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  errors: string[];
}

class LoadTester {
  private baseUrl: string;
  
  constructor(baseUrl: string = 'http://localhost:3456') {
    this.baseUrl = baseUrl;
  }
  
  /**
   * Simulate a single client
   */
  async simulateClient(clientId: number, durationMs: number): Promise<{
    messagesReceived: number;
    latencies: number[];
    errors: string[];
  }> {
    const latencies: number[] = [];
    const errors: string[] = [];
    let messagesReceived = 0;
    let eventSource: EventSource | null = null;
    
    return new Promise((resolve) => {
      try {
        eventSource = new EventSource(`${this.baseUrl}/stream`);
        const messageTimestamps = new Map<string, number>();
        
        eventSource.onopen = () => {
          console.log(`Client ${clientId} connected`);
        };
        
        eventSource.onmessage = (event) => {
          messagesReceived++;
          const data = JSON.parse(event.data);
          
          // Track latency for interaction updates
          if (data.type === 'interaction_posted') {
            messageTimestamps.set(data.data.interactionId, performance.now());
          } else if (data.type === 'interaction_completed') {
            const startTime = messageTimestamps.get(data.data.interactionId);
            if (startTime) {
              latencies.push(performance.now() - startTime);
              messageTimestamps.delete(data.data.interactionId);
            }
          }
        };
        
        eventSource.onerror = (error) => {
          errors.push(`Client ${clientId} SSE error: ${error}`);
        };
        
        // Send messages periodically
        const messageInterval = setInterval(async () => {
          try {
            const startTime = performance.now();
            await fetch(`${this.baseUrl}/message`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                content: `Load test message from client ${clientId}` 
              }),
            });
            // Track request latency
            latencies.push(performance.now() - startTime);
          } catch (error) {
            errors.push(`Client ${clientId} send error: ${error}`);
          }
        }, 1000); // Send message every second
        
        // Run for specified duration
        setTimeout(() => {
          clearInterval(messageInterval);
          eventSource?.close();
          resolve({ messagesReceived, latencies, errors });
        }, durationMs);
        
      } catch (error) {
        errors.push(`Client ${clientId} connection error: ${error}`);
        resolve({ messagesReceived, latencies, errors });
      }
    });
  }
  
  /**
   * Run load test with multiple concurrent clients
   */
  async runLoadTest(
    clientCount: number = 10,
    durationMs: number = 30000
  ): Promise<LoadTestResult> {
    console.log(`🚀 Starting load test with ${clientCount} clients for ${durationMs / 1000} seconds...`);
    
    const startTime = performance.now();
    const clientPromises: Promise<any>[] = [];
    
    // Start all clients
    for (let i = 0; i < clientCount; i++) {
      // Stagger client starts slightly to avoid thundering herd
      await new Promise(resolve => setTimeout(resolve, 100));
      clientPromises.push(this.simulateClient(i, durationMs));
    }
    
    // Wait for all clients to complete
    const results = await Promise.all(clientPromises);
    const duration = performance.now() - startTime;
    
    // Aggregate results
    let totalMessages = 0;
    let successfulConnections = 0;
    const allLatencies: number[] = [];
    const allErrors: string[] = [];
    
    results.forEach(result => {
      totalMessages += result.messagesReceived;
      if (result.messagesReceived > 0) successfulConnections++;
      allLatencies.push(...result.latencies);
      allErrors.push(...result.errors);
    });
    
    // Calculate latency statistics
    const sortedLatencies = allLatencies.sort((a, b) => a - b);
    const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length || 0;
    const p95Index = Math.floor(allLatencies.length * 0.95);
    const p99Index = Math.floor(allLatencies.length * 0.99);
    
    return {
      totalClients: clientCount,
      duration,
      successfulConnections,
      failedConnections: clientCount - successfulConnections,
      messagesReceived: totalMessages,
      averageLatency: avgLatency,
      p95Latency: sortedLatencies[p95Index] || 0,
      p99Latency: sortedLatencies[p99Index] || 0,
      errors: allErrors,
    };
  }
  
  /**
   * Generate load test report
   */
  generateReport(result: LoadTestResult): string {
    const throughput = (result.messagesReceived / (result.duration / 1000)).toFixed(2);
    const connectionSuccessRate = ((result.successfulConnections / result.totalClients) * 100).toFixed(2);
    
    return `
📊 Load Test Results
====================

Test Configuration:
  - Clients: ${result.totalClients}
  - Duration: ${(result.duration / 1000).toFixed(2)}s

Connection Stats:
  - Successful: ${result.successfulConnections}/${result.totalClients} (${connectionSuccessRate}%)
  - Failed: ${result.failedConnections}

Performance Metrics:
  - Total messages: ${result.messagesReceived}
  - Throughput: ${throughput} msg/s
  - Avg latency: ${result.averageLatency.toFixed(2)}ms
  - P95 latency: ${result.p95Latency.toFixed(2)}ms
  - P99 latency: ${result.p99Latency.toFixed(2)}ms

Errors: ${result.errors.length}
${result.errors.length > 0 ? result.errors.slice(0, 5).join('\n') : 'None'}

${result.successfulConnections === result.totalClients ? '✅ All clients connected successfully!' : '⚠️  Some clients failed to connect'}
${result.averageLatency < 100 ? '✅ Excellent latency!' : result.averageLatency < 500 ? '👍 Good latency' : '⚠️  High latency detected'}
`;
  }
  
  /**
   * Run a series of load tests with increasing client counts
   */
  async runScalingTest(): Promise<void> {
    const clientCounts = [1, 5, 10, 25, 50, 100];
    const duration = 20000; // 20 seconds per test
    
    console.log('🔬 Running scaling tests...\n');
    
    for (const count of clientCounts) {
      console.log(`\nTesting with ${count} clients...`);
      const result = await this.runLoadTest(count, duration);
      console.log(this.generateReport(result));
      
      // Save results
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const filename = `load-test-${count}-clients-${timestamp}.json`;
      await Bun.write(filename, JSON.stringify(result, null, 2));
      
      // Give system time to recover between tests
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Run if called directly
if (import.meta.main) {
  const tester = new LoadTester();
  const mode = process.argv[2] || 'single';
  
  if (mode === 'scaling') {
    await tester.runScalingTest();
  } else {
    const clientCount = parseInt(process.argv[3]) || 10;
    const duration = parseInt(process.argv[4]) || 30000;
    
    const result = await tester.runLoadTest(clientCount, duration);
    console.log(tester.generateReport(result));
    
    // Save results
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    await Bun.write(
      `load-test-results-${timestamp}.json`,
      JSON.stringify(result, null, 2)
    );
  }
}

export { LoadTester };