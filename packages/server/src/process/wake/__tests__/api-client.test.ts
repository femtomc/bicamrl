import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { WakeApiClient } from '../api-client';

// Mock fetch globally
const mockFetch = mock(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({}),
  text: () => Promise.resolve('')
}));

globalThis.fetch = mockFetch as any;

describe('WakeApiClient', () => {
  let client: WakeApiClient;
  
  beforeEach(() => {
    client = new WakeApiClient('http://localhost:3456', 'test-id');
    mockFetch.mockClear();
  });
  
  test('should fetch interaction', async () => {
    const mockData = {
      id: 'test-id',
      content: [{ role: 'user', content: 'Hello' }],
      metadata: { test: true }
    };
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData)
    } as any);
    
    const result = await client.fetchInteraction();
    
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3456/interactions/test-id'
    );
    expect(result).toEqual(mockData);
  });
  
  test('should handle fetch errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found',
      text: () => Promise.resolve('Interaction not found')
    } as any);
    
    await expect(client.fetchInteraction())
      .rejects.toThrow('Failed to fetch interaction: Not Found - Interaction not found');
  });
  
  test('should submit result', async () => {
    const result = {
      response: 'Test response',
      model: 'test-model',
      usage: { tokens: 10 }
    };
    
    await client.submitResult(result);
    
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3456/interactions/test-id/result',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      }
    );
  });
  
  test('should submit status update', async () => {
    const metadata = { currentAction: 'Processing...' };
    
    await client.submitStatusUpdate(metadata);
    
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3456/interactions/test-id/result',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isStatusUpdate: true,
          metadata
        })
      }
    );
  });
  
  test('should submit error', async () => {
    await client.submitError('Test error');
    
    const call = mockFetch.mock.calls?.[0];
    if (!call) throw new Error('No mock calls');
    const body = JSON.parse(call[1]?.body || '{}');
    
    expect(body).toEqual({
      error: 'Test error'
    });
  });
  
  test('should submit permission request', async () => {
    await client.submitPermissionRequest(
      'read_file',
      'Read file: test.txt',
      'req-123',
      { name: 'read_file', arguments: { path: 'test.txt' } }
    );
    
    const call = mockFetch.mock.calls?.[0];
    if (!call) throw new Error('No mock calls');
    const body = JSON.parse(call[1]?.body || '{}');
    
    expect(body.metadata.status).toBe('waiting_for_permission');
    expect(body.metadata.toolPermission.toolName).toBe('read_file');
    expect(body.metadata.toolPermission.requestId).toBe('req-123');
  });
});