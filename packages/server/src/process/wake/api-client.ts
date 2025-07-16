/**
 * Wake API Client V2 - Message-based API interactions
 */

export class WakeApiClient {
  constructor(
    private serverUrl: string,
    private interactionId: string
  ) {}

  async getConversation(): Promise<any> {
    const response = await fetch(`${this.serverUrl}/interactions/${this.interactionId}`);
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get conversation: ${response.statusText}`);
    }
    return response.json();
  }

  async updateMessageStatus(messageId: string, status: 'processing' | 'completed' | 'failed'): Promise<void> {
    const response = await fetch(`${this.serverUrl}/messages/${messageId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update message status: ${response.statusText}`);
    }
  }

  async submitAssistantResponse(content: string, metadata?: any): Promise<void> {
    const response = await fetch(`${this.serverUrl}/interactions/${this.interactionId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        ...metadata
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to submit response: ${response.statusText}`);
    }
  }

  async submitStatusUpdate(metadata: any): Promise<void> {
    const response = await fetch(`${this.serverUrl}/interactions/${this.interactionId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata)
    });
    
    if (!response.ok) {
      console.warn(`Failed to submit status update: ${response.statusText}`);
    }
  }

  async requestToolPermission(request: {
    toolName: string;
    description: string;
  }): Promise<boolean> {
    const requestId = Math.random().toString(36).substring(7);
    
    // Submit permission request
    const response = await fetch(`${this.serverUrl}/interactions/${this.interactionId}/permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...request,
        requestId
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to request permission: ${response.statusText}`);
    }
    
    console.log(`[API] Tool permission requested: ${request.toolName}`);
    
    // TODO: Implement proper permission waiting mechanism
    // For now, auto-approve in development mode
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[API] Auto-approving tool permission in development mode`);
      return true;
    }
    
    // In production, we would wait for user response via polling or websocket
    return false;
  }
}