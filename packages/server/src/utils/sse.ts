import type { InteractionStore } from '../interaction/store';
import type { MessageStore } from '../message/store';

/**
 * Create a Server-Sent Events stream for real-time updates
 */
export function createSSEStream(interactionStore: InteractionStore, messageStore?: MessageStore): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      // Send initial connection message
      controller.enqueue(encoder.encode(': connected\n\n'));
      
      // Subscribe to interaction updates
      const unsubscribeInteraction = interactionStore.subscribe(event => {
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch (error) {
          // Controller might be closed, ignore
        }
      });
      
      // Subscribe to message updates if store provided
      let unsubscribeMessage: (() => void) | null = null;
      if (messageStore) {
        unsubscribeMessage = messageStore.subscribe(event => {
          try {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch (error) {
            // Controller might be closed, ignore
          }
        });
      }
      
      // Set up keep-alive
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch (error) {
          // Controller might be closed, clear interval
          clearInterval(keepAlive);
        }
      }, 30000);
      
      // Clean up function
      const cleanup = () => {
        unsubscribeInteraction();
        if (unsubscribeMessage) {
          unsubscribeMessage();
        }
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch {
          // Controller might already be closed
        }
      };
      
      // Handle abort signal if available
      const signal = (controller as any).signal;
      if (signal) {
        signal.addEventListener('abort', cleanup);
      }
      
      // Store cleanup function for external access
      (controller as any).cleanup = cleanup;
    }
  });
}

/**
 * Format an SSE message
 */
export function formatSSEMessage(event: string, data: any): string {
  const lines = [`event: ${event}`];
  
  if (data !== undefined) {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    lines.push(`data: ${dataStr}`);
  }
  
  return lines.join('\n') + '\n\n';
}

/**
 * Create an SSE response with proper headers
 */
export function createSSEResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    },
  });
}