#!/usr/bin/env bun
/**
 * Performance benchmark comparing polling vs SSE approaches
 */

import { performance } from 'perf_hooks';

interface BenchmarkResult {
  approach: 'polling' | 'sse';
  duration: number;
  requests: number;
  bytesTransferred: number;
  cpuUsage: NodeJS.CpuUsage;
  memoryUsage: NodeJS.MemoryUsage;
  latency: {
    min: number;
    max: number;
    avg: number;
    p95: number;
    p99: number;
  };
}

class PerformanceBenchmark {
  private baseUrl: string;
  private results: BenchmarkResult[] = [];
  
  constructor(baseUrl: string = 'http://localhost:3456') {
    this.baseUrl = baseUrl;
  }
  
  /**
   * Simulate the old polling approach
   */
  async benchmarkPolling(durationMs: number = 60000): Promise<BenchmarkResult> {
    console.log('📊 Starting polling benchmark...');
    const startTime = performance.now();
    const startCpu = process.cpuUsage();
    const startMem = process.memoryUsage();
    
    let requests = 0;
    let bytesTransferred = 0;
    const latencies: number[] = [];
    
    // Poll every 16ms like the old implementation
    const pollInterval = 16;
    const endTime = startTime + durationMs;
    
    while (performance.now() < endTime) {
      const reqStart = performance.now();
      try {
        const response = await fetch(`${this.baseUrl}/interactions`);
        const data = await response.text();
        bytesTransferred += data.length;
        requests++;
        latencies.push(performance.now() - reqStart);
      } catch (error) {
        console.error('Polling error:', error);
      }
      
      // Wait for next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    const duration = performance.now() - startTime;
    const endCpu = process.cpuUsage(startCpu);
    const endMem = process.memoryUsage();
    
    return {
      approach: 'polling',
      duration,
      requests,
      bytesTransferred,
      cpuUsage: endCpu,
      memoryUsage: {
        rss: endMem.rss - startMem.rss,
        heapTotal: endMem.heapTotal - startMem.heapTotal,
        heapUsed: endMem.heapUsed - startMem.heapUsed,
        external: endMem.external - startMem.external,
        arrayBuffers: endMem.arrayBuffers - startMem.arrayBuffers,
      },
      latency: this.calculateLatencyStats(latencies),
    };
  }
  
  /**
   * Simulate the new SSE approach
   */
  async benchmarkSSE(durationMs: number = 60000): Promise<BenchmarkResult> {
    console.log('📊 Starting SSE benchmark...');
    const startTime = performance.now();
    const startCpu = process.cpuUsage();
    const startMem = process.memoryUsage();
    
    let requests = 1; // Initial SSE connection
    let bytesTransferred = 0;
    const latencies: number[] = [];
    
    return new Promise((resolve) => {
      const eventSource = new EventSource(`${this.baseUrl}/stream`);
      
      eventSource.onmessage = (event) => {
        const eventTime = performance.now();
        bytesTransferred += event.data.length;
        
        // Simulate fetching individual interaction on update
        if (event.data.includes('interaction_updated')) {
          const fetchStart = performance.now();
          fetch(`${this.baseUrl}/interactions/test-id`)
            .then(response => response.text())
            .then(data => {
              bytesTransferred += data.length;
              requests++;
              latencies.push(performance.now() - fetchStart);
            })
            .catch(console.error);
        }
      };
      
      // Run for specified duration
      setTimeout(() => {
        eventSource.close();
        const duration = performance.now() - startTime;
        const endCpu = process.cpuUsage(startCpu);
        const endMem = process.memoryUsage();
        
        resolve({
          approach: 'sse',
          duration,
          requests,
          bytesTransferred,
          cpuUsage: endCpu,
          memoryUsage: {
            rss: endMem.rss - startMem.rss,
            heapTotal: endMem.heapTotal - startMem.heapTotal,
            heapUsed: endMem.heapUsed - startMem.heapUsed,
            external: endMem.external - startMem.external,
            arrayBuffers: endMem.arrayBuffers - startMem.arrayBuffers,
          },
          latency: this.calculateLatencyStats(latencies),
        });
      }, durationMs);
    });
  }
  
  private calculateLatencyStats(latencies: number[]): BenchmarkResult['latency'] {
    if (latencies.length === 0) {
      return { min: 0, max: 0, avg: 0, p95: 0, p99: 0 };
    }
    
    const sorted = latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);
    
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg,
      p95: sorted[p95Index] || sorted[sorted.length - 1],
      p99: sorted[p99Index] || sorted[sorted.length - 1],
    };
  }
  
  /**
   * Compare results and generate report
   */
  generateReport(pollingResult: BenchmarkResult, sseResult: BenchmarkResult): string {
    const improvement = {
      requests: ((pollingResult.requests - sseResult.requests) / pollingResult.requests * 100).toFixed(2),
      bytes: ((pollingResult.bytesTransferred - sseResult.bytesTransferred) / pollingResult.bytesTransferred * 100).toFixed(2),
      cpu: ((pollingResult.cpuUsage.user - sseResult.cpuUsage.user) / pollingResult.cpuUsage.user * 100).toFixed(2),
      memory: ((pollingResult.memoryUsage.heapUsed - sseResult.memoryUsage.heapUsed) / pollingResult.memoryUsage.heapUsed * 100).toFixed(2),
      latency: ((pollingResult.latency.avg - sseResult.latency.avg) / pollingResult.latency.avg * 100).toFixed(2),
    };
    
    return `
🚀 Performance Benchmark Results
================================

Test Duration: ${(pollingResult.duration / 1000).toFixed(2)}s

📊 Polling Approach:
  - Requests: ${pollingResult.requests}
  - Data transferred: ${(pollingResult.bytesTransferred / 1024 / 1024).toFixed(2)} MB
  - CPU usage: ${(pollingResult.cpuUsage.user / 1000).toFixed(2)}ms
  - Memory: ${(pollingResult.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
  - Avg latency: ${pollingResult.latency.avg.toFixed(2)}ms
  - P95 latency: ${pollingResult.latency.p95.toFixed(2)}ms
  - P99 latency: ${pollingResult.latency.p99.toFixed(2)}ms

📡 SSE Approach:
  - Requests: ${sseResult.requests}
  - Data transferred: ${(sseResult.bytesTransferred / 1024 / 1024).toFixed(2)} MB
  - CPU usage: ${(sseResult.cpuUsage.user / 1000).toFixed(2)}ms
  - Memory: ${(sseResult.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
  - Avg latency: ${sseResult.latency.avg.toFixed(2)}ms
  - P95 latency: ${sseResult.latency.p95.toFixed(2)}ms
  - P99 latency: ${sseResult.latency.p99.toFixed(2)}ms

✨ Improvements:
  - ${improvement.requests}% fewer requests
  - ${improvement.bytes}% less data transferred
  - ${improvement.cpu}% less CPU usage
  - ${improvement.memory}% less memory usage
  - ${improvement.latency}% lower average latency

🎯 Summary:
  - Requests/minute: ${Math.round(pollingResult.requests / (pollingResult.duration / 60000))} → ${Math.round(sseResult.requests / (sseResult.duration / 60000))}
  - That's ${Math.round(pollingResult.requests / (pollingResult.duration / 60000)) - Math.round(sseResult.requests / (sseResult.duration / 60000))} fewer requests per minute!
`;
  }
  
  /**
   * Run the full benchmark suite
   */
  async run(durationMs: number = 30000): Promise<void> {
    console.log(`🏃 Running performance benchmarks for ${durationMs / 1000} seconds each...`);
    
    // Ensure server is running
    try {
      await fetch(`${this.baseUrl}/status`);
    } catch (error) {
      console.error('❌ Server not running! Please start the server first.');
      process.exit(1);
    }
    
    // Run benchmarks
    const pollingResult = await this.benchmarkPolling(durationMs);
    console.log('✅ Polling benchmark complete');
    
    // Give system a moment to settle
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const sseResult = await this.benchmarkSSE(durationMs);
    console.log('✅ SSE benchmark complete');
    
    // Generate and display report
    const report = this.generateReport(pollingResult, sseResult);
    console.log(report);
    
    // Save results to file
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const resultsFile = `benchmark-results-${timestamp}.json`;
    await Bun.write(resultsFile, JSON.stringify({ pollingResult, sseResult }, null, 2));
    console.log(`📁 Detailed results saved to ${resultsFile}`);
  }
}

// Run if called directly
if (import.meta.main) {
  const duration = parseInt(process.argv[2]) || 30000;
  const benchmark = new PerformanceBenchmark();
  await benchmark.run(duration);
}

export { PerformanceBenchmark };