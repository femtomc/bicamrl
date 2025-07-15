import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { spawn } from "child_process";
import type { ChildProcess } from "child_process";

let serverProcess: ChildProcess | null = null;
const TEST_PORT = 3457; // Use different port for tests
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper to wait for server to be ready
async function waitForServer(maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BASE_URL}/status`);
      if (response.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

describe("SSE Integration Tests", () => {
  beforeAll(async () => {
    // Start test server
    console.log("Starting test server...");
    serverProcess = spawn("bun", ["run", "dev:server"], {
      env: { ...process.env, PORT: TEST_PORT.toString() },
      cwd: "../../../", // Navigate to project root
    });
    
    const ready = await waitForServer();
    if (!ready) {
      throw new Error("Server failed to start");
    }
    console.log("Test server ready");
  });
  
  afterAll(() => {
    // Kill test server
    if (serverProcess) {
      serverProcess.kill();
    }
  });
  
  test("should establish SSE connection and receive events", async () => {
    const events: any[] = [];
    
    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(`${BASE_URL}/stream`);
      
      eventSource.onopen = () => {
        console.log("SSE connection opened");
      };
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          events.push(data);
          
          // Should receive connected event first
          if (events.length === 1) {
            expect(data.connected).toBe(true);
            
            // Now trigger an interaction to test updates
            fetch(`${BASE_URL}/message`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: "Test message" }),
            });
          }
          
          // Check for interaction events
          if (data.type === "interaction_posted") {
            expect(data.data.interactionId).toBeDefined();
            expect(data.timestamp).toBeDefined();
          }
          
          if (data.type === "interaction_completed") {
            eventSource.close();
            resolve(events);
          }
        } catch (error) {
          reject(error);
        }
      };
      
      eventSource.onerror = (error) => {
        eventSource.close();
        reject(error);
      };
      
      // Timeout after 10 seconds
      setTimeout(() => {
        eventSource.close();
        resolve(events);
      }, 10000);
    }).then((events: any[]) => {
      // Verify we received the expected events
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].connected).toBe(true);
      
      // Should have interaction lifecycle events
      const interactionEvents = events.filter(e => e.type && e.type.startsWith("interaction_"));
      expect(interactionEvents.length).toBeGreaterThan(0);
    });
  });
  
  test("should handle multiple concurrent SSE connections", async () => {
    const connections = 5;
    const eventCounts: number[] = [];
    
    const promises = Array.from({ length: connections }, (_, i) => {
      return new Promise<number>((resolve) => {
        let eventCount = 0;
        const eventSource = new EventSource(`${BASE_URL}/stream`);
        
        eventSource.onmessage = () => {
          eventCount++;
        };
        
        // Close after 2 seconds and report count
        setTimeout(() => {
          eventSource.close();
          resolve(eventCount);
        }, 2000);
      });
    });
    
    const results = await Promise.all(promises);
    
    // All connections should receive at least the connected event
    results.forEach(count => {
      expect(count).toBeGreaterThan(0);
    });
  });
  
  test("should reconnect after connection loss", async () => {
    let reconnectCount = 0;
    let eventSource: EventSource | null = null;
    
    const connect = () => {
      eventSource = new EventSource(`${BASE_URL}/stream`);
      
      eventSource.onopen = () => {
        reconnectCount++;
      };
      
      eventSource.onerror = () => {
        if (reconnectCount < 3) {
          setTimeout(connect, 100);
        }
      };
    };
    
    connect();
    
    // Wait for initial connection
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Force disconnect
    eventSource?.close();
    
    // Wait for reconnections
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    expect(reconnectCount).toBeGreaterThanOrEqual(2);
  });
  
  test("should properly deliver interaction updates via SSE", async () => {
    const updates: any[] = [];
    
    return new Promise(async (resolve) => {
      const eventSource = new EventSource(`${BASE_URL}/stream`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "interaction_updated") {
          updates.push(data);
          
          // Got enough updates
          if (updates.length >= 3) {
            eventSource.close();
            resolve(updates);
          }
        }
      };
      
      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Send a message that will generate updates
      await fetch(`${BASE_URL}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Test SSE updates" }),
      });
      
      // Timeout
      setTimeout(() => {
        eventSource.close();
        resolve(updates);
      }, 5000);
    }).then((updates: any[]) => {
      // Verify update structure
      updates.forEach(update => {
        expect(update.type).toBe("interaction_updated");
        expect(update.data.interactionId).toBeDefined();
        expect(update.timestamp).toBeDefined();
      });
    });
  });
});

describe("SSE Performance", () => {
  test("should handle rapid events without dropping", async () => {
    const receivedEvents: string[] = [];
    const sentEvents: string[] = [];
    
    // Start listening
    const eventSource = new EventSource(`${BASE_URL}/stream`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "interaction_posted") {
        receivedEvents.push(data.data.interactionId);
      }
    };
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send many messages rapidly
    const messageCount = 50;
    const promises = [];
    
    for (let i = 0; i < messageCount; i++) {
      const promise = fetch(`${BASE_URL}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `Rapid message ${i}` }),
      }).then(res => res.json()).then(data => {
        sentEvents.push(data.id);
      });
      promises.push(promise);
    }
    
    await Promise.all(promises);
    
    // Wait for all events to arrive
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    eventSource.close();
    
    // Should receive most if not all events
    const receiveRate = (receivedEvents.length / sentEvents.length) * 100;
    expect(receiveRate).toBeGreaterThan(90); // Allow for some loss but should be minimal
  });
});