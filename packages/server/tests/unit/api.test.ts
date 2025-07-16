import { test, expect, describe, beforeAll } from "bun:test";
import createApp from "../../src/api/routes";

describe("API Routes", () => {
  let app: any;
  
  beforeAll(async () => {
    app = await createApp;
  });

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
    expect(json.type).toBe("query");
  });

  test("POST /message requires content", async () => {
    const res = await app.request("/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    
    const json = await res.json();
    
    expect(res.status).toBe(400);
    expect(json.error).toBe("Content is required");
  });

  test("GET /status returns 404", async () => {
    const res = await app.request("/status");
    
    expect(res.status).toBe(404);
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