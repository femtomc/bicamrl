import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { SSEHandler } from '../sse-handler';

describe('SSEHandler', () => {
  let handler: SSEHandler;
  let onEventMock: any;
  let mockFetch: any;
  
  beforeEach(() => {
    onEventMock = mock();
    handler = new SSEHandler('http://localhost:3456', 'test-id', onEventMock);
    
    mockFetch = mock(() => Promise.resolve({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          // Send test events
          controller.enqueue(encoder.encode('data: {"type":"test","data":{"interactionId":"test-id","interaction":{}}}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"other","data":{"interactionId":"other-id","interaction":{}}}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"update","data":{"interactionId":"test-id","interaction":{"updated":true}}}\n\n'));
          controller.close();
        }
      })
    }));
    
    globalThis.fetch = mockFetch as any;
  });
  
  test('should connect to SSE endpoint', async () => {
    const stream = await handler.connect();
    
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3456/stream',
      {
        headers: {
          'Accept': 'text/event-stream',
        }
      }
    );
    expect(stream).toBeDefined();
  });
  
  test('should handle connection errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      body: null
    });
    
    await expect(handler.connect()).rejects.toThrow('Failed to connect to SSE stream');
  });
  
  test('should process SSE events for matching interaction ID', async () => {
    const stream = await handler.connect();
    await handler.processStream(stream);
    
    // Should have received 2 events for test-id
    expect(onEventMock).toHaveBeenCalledTimes(2);
    
    const firstCall = onEventMock.mock.calls[0][0];
    expect(firstCall.type).toBe('test');
    expect(firstCall.data.interactionId).toBe('test-id');
    
    const secondCall = onEventMock.mock.calls[1][0];
    expect(secondCall.type).toBe('update');
    expect(secondCall.data.interaction.updated).toBe(true);
  });
  
  test('should ignore events for other interaction IDs', async () => {
    const stream = await handler.connect();
    await handler.processStream(stream);
    
    // Should not have received the 'other' event
    const calls = onEventMock.mock.calls;
    const otherEvents = calls.filter((call: any[]) => call[0].type === 'other');
    expect(otherEvents.length).toBe(0);
  });
  
  test('should handle partial data buffering', async () => {
    const customFetch = mock(() => Promise.resolve({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          // Send data in chunks
          controller.enqueue(encoder.encode('data: {"type":"te'));
          controller.enqueue(encoder.encode('st","data":{"interact'));
          controller.enqueue(encoder.encode('ionId":"test-id","interaction":{}}}\n\n'));
          controller.close();
        }
      })
    }));
    
    globalThis.fetch = customFetch as any;
    
    const stream = await handler.connect();
    await handler.processStream(stream);
    
    expect(onEventMock).toHaveBeenCalledTimes(1);
    expect(onEventMock.mock.calls[0][0].type).toBe('test');
  });
  
  test('should handle malformed JSON gracefully', async () => {
    const customFetch = mock(() => Promise.resolve({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {invalid json}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"valid","data":{"interactionId":"test-id","interaction":{}}}\n\n'));
          controller.close();
        }
      })
    }));
    
    globalThis.fetch = customFetch as any;
    
    const stream = await handler.connect();
    // Should not throw
    await handler.processStream(stream);
    
    // Should still process valid event
    expect(onEventMock).toHaveBeenCalledTimes(1);
    expect(onEventMock.mock.calls[0][0].type).toBe('valid');
  });
  
  test('should handle keep-alive messages', async () => {
    const customFetch = mock(() => Promise.resolve({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"test","data":{"interactionId":"test-id","interaction":{}}}\n\n'));
          controller.close();
        }
      })
    }));
    
    globalThis.fetch = customFetch as any;
    
    const stream = await handler.connect();
    await handler.processStream(stream);
    
    // Should only process data events
    expect(onEventMock).toHaveBeenCalledTimes(1);
  });
});