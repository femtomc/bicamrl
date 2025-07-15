import { expect, test, describe, beforeEach } from "bun:test";

// Mock interaction cache similar to our GUI implementation
class InteractionCache {
  private cache: Map<string, any> = new Map();
  private hits = 0;
  private misses = 0;
  
  get(id: string): any | undefined {
    const result = this.cache.get(id);
    if (result) {
      this.hits++;
    } else {
      this.misses++;
    }
    return result;
  }
  
  set(id: string, value: any): void {
    this.cache.set(id, value);
  }
  
  has(id: string): boolean {
    return this.cache.has(id);
  }
  
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
  
  getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
      size: this.cache.size,
    };
  }
  
  needsUpdate(id: string): boolean {
    const cached = this.cache.get(id);
    if (!cached) return true;
    
    // Check if interaction is in a final state
    const status = cached.status;
    return status !== 'completed' && status !== 'error';
  }
}

describe("InteractionCache", () => {
  let cache: InteractionCache;
  
  beforeEach(() => {
    cache = new InteractionCache();
  });
  
  test("should store and retrieve interactions", () => {
    const interaction = {
      id: "test-123",
      status: "processing",
      content: "test content",
    };
    
    cache.set(interaction.id, interaction);
    expect(cache.get(interaction.id)).toEqual(interaction);
  });
  
  test("should track cache hits and misses", () => {
    cache.set("exists", { id: "exists" });
    
    // Hit
    cache.get("exists");
    // Miss
    cache.get("not-exists");
    // Another hit
    cache.get("exists");
    
    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(66.67, 1);
  });
  
  test("should determine if interaction needs update", () => {
    // Completed interactions don't need updates
    cache.set("completed", { id: "completed", status: "completed" });
    expect(cache.needsUpdate("completed")).toBe(false);
    
    // Processing interactions need updates
    cache.set("processing", { id: "processing", status: "processing" });
    expect(cache.needsUpdate("processing")).toBe(true);
    
    // Non-existent interactions need to be fetched
    expect(cache.needsUpdate("not-exists")).toBe(true);
  });
  
  test("should handle cache invalidation", () => {
    cache.set("1", { id: "1" });
    cache.set("2", { id: "2" });
    expect(cache.getStats().size).toBe(2);
    
    cache.clear();
    expect(cache.getStats().size).toBe(0);
    expect(cache.get("1")).toBeUndefined();
  });
  
  test("should handle concurrent updates", () => {
    const interaction = { id: "test", status: "processing" };
    
    // Simulate multiple updates
    cache.set(interaction.id, interaction);
    cache.set(interaction.id, { ...interaction, status: "waiting_for_permission" });
    cache.set(interaction.id, { ...interaction, status: "completed" });
    
    const final = cache.get(interaction.id);
    expect(final.status).toBe("completed");
    expect(cache.needsUpdate(interaction.id)).toBe(false);
  });
});

describe("Cache Performance", () => {
  test("should handle large numbers of interactions efficiently", () => {
    const cache = new InteractionCache();
    const startTime = performance.now();
    
    // Add 10,000 interactions
    for (let i = 0; i < 10000; i++) {
      cache.set(`interaction-${i}`, {
        id: `interaction-${i}`,
        status: i % 3 === 0 ? "completed" : "processing",
        data: `data-${i}`,
      });
    }
    
    const insertTime = performance.now() - startTime;
    expect(insertTime).toBeLessThan(100); // Should be fast
    
    // Test retrieval performance
    const retrievalStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      cache.get(`interaction-${Math.floor(Math.random() * 10000)}`);
    }
    const retrievalTime = performance.now() - retrievalStart;
    expect(retrievalTime).toBeLessThan(10); // Should be very fast
    
    const stats = cache.getStats();
    expect(stats.size).toBe(10000);
    expect(stats.hits).toBeGreaterThan(900); // Most should be hits
  });
  
  test("should efficiently check update needs", () => {
    const cache = new InteractionCache();
    
    // Mix of completed and processing
    for (let i = 0; i < 1000; i++) {
      cache.set(`id-${i}`, {
        id: `id-${i}`,
        status: i % 2 === 0 ? "completed" : "processing",
      });
    }
    
    const startTime = performance.now();
    let needsUpdateCount = 0;
    
    for (let i = 0; i < 1000; i++) {
      if (cache.needsUpdate(`id-${i}`)) {
        needsUpdateCount++;
      }
    }
    
    const checkTime = performance.now() - startTime;
    expect(checkTime).toBeLessThan(5);
    expect(needsUpdateCount).toBe(500); // Half should need updates
  });
});