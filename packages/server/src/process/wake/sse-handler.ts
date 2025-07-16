/**
 * SSE Handler V2 - Polls for message events (EventSource not available in Bun subprocess)
 */

export class SSEHandler {
  private pollInterval?: Timer;
  private lastEventTimestamp?: Date;
  
  constructor(
    private serverUrl: string,
    private interactionId: string,
    private onEvent: (event: any) => void
  ) {}

  async connect(): Promise<void> {
    console.log(`[SSE] Starting polling for interaction ${this.interactionId}`);
    
    // Poll every 500ms for new messages
    this.pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${this.serverUrl}/interactions/${this.interactionId}`);
        if (!response.ok) return;
        
        const conversation = await response.json();
        
        // Check for new messages
        const messages = conversation.messages || [];
        for (const message of messages) {
          const messageTime = new Date(message.timestamp);
          if (!this.lastEventTimestamp || messageTime > this.lastEventTimestamp) {
            this.lastEventTimestamp = messageTime;
            
            // Simulate SSE event
            this.onEvent({
              type: 'message:added',
              data: {
                message,
                interactionId: this.interactionId
              }
            });
          }
        }
      } catch (error) {
        // Ignore polling errors
      }
    }, 500);
  }

  async disconnect(): Promise<void> {
    if (this.pollInterval) {
      console.log('[SSE] Stopping polling');
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }
}