/**
 * Direct Permission Strategy
 * 
 * Uses our existing permission flow through the Interaction/Message system.
 * This is used for custom agents that we control (not Claude Code).
 */

import type { PermissionStrategy, PermissionRequest } from '../types';
import { WakeApiClient } from '../../process/wake/api-client';

export class DirectPermissionStrategy implements PermissionStrategy {
  private apiClient: WakeApiClient;

  constructor(
    private interactionId: string,
    private serverUrl: string
  ) {
    this.apiClient = new WakeApiClient(serverUrl, interactionId);
  }

  async requestPermission(request: PermissionRequest): Promise<boolean> {
    try {
      console.log(`[DirectPermissionStrategy] Requesting permission for ${request.toolCall.name}`);
      
      // Request permission - the API client handles the waiting
      const approved = await this.apiClient.requestToolPermission({
        toolName: request.toolCall.name,
        description: request.description || `Execute ${request.toolCall.name} tool`
      });

      return approved;
    } catch (error) {
      console.error('[DirectPermissionStrategy] Error requesting permission:', error);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    // Nothing to clean up for direct strategy
  }
}