/**
 * Test setup and utilities for Bun tests
 */

// Helper to create mock interactions
export function createMockInteraction(overrides: any = {}) {
  return {
    id: `test-interaction-${Date.now()}`,
    source: "user",
    interaction_type: "query",
    content: [],
    agent_id: "user",
    needs_work: false,
    review_stack: [],
    timestamp: new Date().toISOString(),
    status: "draft",
    ...overrides,
  };
}

// Helper to create mock messages
export function createMockMessage(role: string, content: string, overrides: any = {}) {
  return {
    role,
    content,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// Wait for async operations
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mock SSE client for testing streaming
export class MockSSEClient {
  events: any[] = [];
  
  onMessage(event: any) {
    this.events.push(event);
  }
  
  getEvents() {
    return this.events;
  }
  
  clear() {
    this.events = [];
  }
}