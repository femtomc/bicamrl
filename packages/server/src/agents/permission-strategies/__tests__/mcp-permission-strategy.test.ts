import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { MCPPermissionStrategy } from '../mcp-permission-strategy';
import { WakeApiClient } from '../../../process/wake/api-client';
import type { PermissionRequest } from '../../types';

describe('MCPPermissionStrategy', () => {
  let strategy: MCPPermissionStrategy;
  const interactionId = 'test-interaction-123';
  const serverUrl = 'http://localhost:3456';

  beforeEach(() => {
    strategy = new MCPPermissionStrategy(interactionId, serverUrl);
  });

  describe('initialize', () => {
    test('logs initialization message', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
      };

      try {
        await strategy.initialize();
        
        expect(logs).toHaveLength(2);
        expect(logs[0]).toContain('Initializing (placeholder - MCP not yet implemented)');
        expect(logs[1]).toContain('Using direct permission flow for now');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('requestPermission', () => {
    test('falls back to direct permission flow', async () => {
      const request: PermissionRequest = {
        toolCall: {
          id: 'call-123',
          name: 'Read',
          arguments: { path: '/test.txt' }
        },
        interactionId,
        description: 'Read file contents'
      };

      // Mock API client
      let capturedRequest: any = null;
      const originalRequest = WakeApiClient.prototype.requestToolPermission;
      WakeApiClient.prototype.requestToolPermission = async function(req: any) {
        capturedRequest = req;
        return true;
      };

      try {
        const approved = await strategy.requestPermission(request);

        expect(approved).toBe(true);
        expect(capturedRequest).toBeDefined();
        expect(capturedRequest.toolName).toBe('Read');
        expect(capturedRequest.description).toBe('Read file contents');
      } finally {
        WakeApiClient.prototype.requestToolPermission = originalRequest;
      }
    });

    test('uses tool-specific descriptions', async () => {
      const tools = [
        { name: 'Read', expectedDesc: 'Read the contents of a file' },
        { name: 'Write', expectedDesc: 'Write or modify a file' },
        { name: 'Edit', expectedDesc: 'Edit a file' },
        { name: 'LS', expectedDesc: 'List files in a directory' },
        { name: 'Bash', expectedDesc: 'Execute a shell command' },
        { name: 'TodoWrite', expectedDesc: 'Update your todo list' },
        { name: 'UnknownTool', expectedDesc: 'Execute UnknownTool tool' }
      ];

      let capturedRequest: any = null;
      const originalRequest = WakeApiClient.prototype.requestToolPermission;
      WakeApiClient.prototype.requestToolPermission = async function(req: any) {
        capturedRequest = req;
        return true;
      };

      try {
        for (const { name, expectedDesc } of tools) {
          const request: PermissionRequest = {
            toolCall: {
              id: `call-${name}`,
              name,
              arguments: {}
            },
            interactionId
          };

          await strategy.requestPermission(request);
          expect(capturedRequest.description).toBe(expectedDesc);
        }
      } finally {
        WakeApiClient.prototype.requestToolPermission = originalRequest;
      }
    });

    test('logs permission result', async () => {
      const request: PermissionRequest = {
        toolCall: {
          id: 'call-456',
          name: 'Write',
          arguments: { path: '/test.txt', content: 'data' }
        },
        interactionId
      };

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
      };

      // Test approval
      const originalRequest = WakeApiClient.prototype.requestToolPermission;
      WakeApiClient.prototype.requestToolPermission = async function() {
        return true;
      };

      try {
        await strategy.requestPermission(request);
        
        const approvalLog = logs.find(log => 
          log.includes('[MCPPermissionStrategy]') && 
          log.includes('Permission granted for Write')
        );
        expect(approvalLog).toBeDefined();
      } finally {
        WakeApiClient.prototype.requestToolPermission = originalRequest;
        console.log = originalLog;
      }
    });

    test('handles API errors', async () => {
      const request: PermissionRequest = {
        toolCall: {
          id: 'call-error',
          name: 'Bash',
          arguments: { command: 'dangerous command' }
        },
        interactionId
      };

      const originalRequest = WakeApiClient.prototype.requestToolPermission;
      WakeApiClient.prototype.requestToolPermission = async function() {
        throw new Error('API error');
      };

      const errors: string[] = [];
      const originalError = console.error;
      console.error = (...args: any[]) => {
        errors.push(args.join(' '));
      };

      try {
        const approved = await strategy.requestPermission(request);
        
        expect(approved).toBe(false);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Error requesting permission');
        expect(errors[0]).toContain('API error');
      } finally {
        WakeApiClient.prototype.requestToolPermission = originalRequest;
        console.error = originalError;
      }
    });
  });

  describe('cleanup', () => {
    test('logs cleanup message', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
      };

      try {
        await strategy.cleanup();
        
        expect(logs).toHaveLength(1);
        expect(logs[0]).toContain('[MCPPermissionStrategy] Cleaning up');
      } finally {
        console.log = originalLog;
      }
    });
  });
});