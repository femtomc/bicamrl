import { test, expect, describe } from "bun:test";
import app from "../../src/api/routes";

describe("API Routes", () => {
  test("GET /health returns ok", async () => {
    const res = await app.request("/health");
    const json = await res.json();
    
    expect(res.status).toBe(200);
    expect(json.status).toBe("ok");
  });

  test("POST /message queues interaction", async () => {
    const res = await app.request("/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Hello world" })
    });
    
    const json = await res.json();
    
    expect(res.status).toBe(200);
    expect(json.id).toBeDefined();
    expect(json.status).toBe("queued");
  });

  test("POST /message requires content", async () => {
    const res = await app.request("/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    
    const json = await res.json();
    
    expect(res.status).toBe(400);
    expect(json.error).toBe("No content provided");
  });

  test("GET /status returns queue stats", async () => {
    const res = await app.request("/status");
    const json = await res.json();
    
    expect(res.status).toBe(200);
    expect(json).toHaveProperty("queueSize");
    expect(json).toHaveProperty("processing");
    expect(json).toHaveProperty("completed");
  });

  test("GET /interactions returns all interactions", async () => {
    // Post a message first
    await app.request("/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Test message" })
    });
    
    const res = await app.request("/interactions");
    const json = await res.json();
    
    expect(res.status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });

  test("GET /stream returns SSE stream", async () => {
    const res = await app.request("/stream");
    
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });
});