import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { DirectPermissionStrategy } from '../direct-permission-strategy';
import { WakeApiClient } from '../../../process/wake/api-client';
import type { PermissionRequest } from '../../types';

describe('DirectPermissionStrategy', () => {
  let strategy: DirectPermissionStrategy;
  const interactionId = 'test-interaction-123';
  const serverUrl = 'http://localhost:3456';

  beforeEach(() => {
    strategy = new DirectPermissionStrategy(interactionId, serverUrl);
  });

  describe('requestPermission', () => {
    test('requests permission through API client', async () => {
      const request: PermissionRequest = {
        toolCall: {
          id: 'call-123',
          name: 'bash',
          arguments: { command: 'ls -la' }
        },
        interactionId,
        description: 'List directory contents'
      };

      // Mock API client
      let capturedRequest: any = null;
      const originalRequest = WakeApiClient.prototype.requestToolPermission;
      WakeApiClient.prototype.requestToolPermission = async function(req: any) {
        capturedRequest = req;
        return true; // Approved
      };

      try {
        const approved = await strategy.requestPermission(request);

        expect(approved).toBe(true);
        expect(capturedRequest).toBeDefined();
        expect(capturedRequest.toolName).toBe('bash');
        expect(capturedRequest.description).toBe('List directory contents');
      } finally {
        WakeApiClient.prototype.requestToolPermission = originalRequest;
      }
    });

    test('uses default description when not provided', async () => {
      const request: PermissionRequest = {
        toolCall: {
          id: 'call-456',
          name: 'read_file',
          arguments: { path: '/test.txt' }
        },
        interactionId
      };

      let capturedRequest: any = null;
      const originalRequest = WakeApiClient.prototype.requestToolPermission;
      WakeApiClient.prototype.requestToolPermission = async function(req: any) {
        capturedRequest = req;
        return true;
      };

      try {
        await strategy.requestPermission(request);

        expect(capturedRequest.description).toBe('Execute read_file tool');
      } finally {
        WakeApiClient.prototype.requestToolPermission = originalRequest;
      }
    });

    test('returns false when permission denied', async () => {
      const request: PermissionRequest = {
        toolCall: {
          id: 'call-789',
          name: 'write_file',
          arguments: { path: '/etc/passwd', content: 'hacked' }
        },
        interactionId
      };

      const originalRequest = WakeApiClient.prototype.requestToolPermission;
      WakeApiClient.prototype.requestToolPermission = async function() {
        return false; // Denied
      };

      try {
        const approved = await strategy.requestPermission(request);
        expect(approved).toBe(false);
      } finally {
        WakeApiClient.prototype.requestToolPermission = originalRequest;
      }
    });

    test('handles API errors gracefully', async () => {
      const request: PermissionRequest = {
        toolCall: {
          id: 'call-error',
          name: 'bash',
          arguments: { command: 'rm -rf /' }
        },
        interactionId
      };

      const originalRequest = WakeApiClient.prototype.requestToolPermission;
      WakeApiClient.prototype.requestToolPermission = async function() {
        throw new Error('Network error');
      };

      // Capture console.error
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
        expect(errors[0]).toContain('Network error');
      } finally {
        WakeApiClient.prototype.requestToolPermission = originalRequest;
        console.error = originalError;
      }
    });
  });

  describe('cleanup', () => {
    test('cleanup is a no-op', async () => {
      // Should not throw
      await expect(strategy.cleanup()).resolves.not.toThrow();
    });
  });
});