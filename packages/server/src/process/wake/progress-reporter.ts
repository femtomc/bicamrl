/**
 * Progress Reporter for Wake Process
 * Handles real-time progress updates during LLM processing
 */

export class ProgressReporter {
  private progressInterval?: Timer;
  private startTime?: number;
  private updateCount = 0;
  
  constructor(
    private onUpdate: (metadata: any) => Promise<void>
  ) {}

  start(): void {
    this.startTime = Date.now();
    this.updateCount = 0;
    
    // Update progress every 500ms to reduce server load
    this.progressInterval = setInterval(async () => {
      const elapsed = Date.now() - this.startTime!;
      const seconds = Math.floor(elapsed / 1000);
      const tenths = Math.floor((elapsed % 1000) / 100);
      
      // Rotating animation symbols
      const symbols = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      const symbol = symbols[this.updateCount % symbols.length];
      
      const currentAction = `${symbol} Thinking... ${seconds}.${tenths}s`;
      
      try {
        await this.onUpdate({ 
          currentAction,
          startedAt: new Date(this.startTime!),
          processor: 'wake'
        });
        this.updateCount++;
      } catch (error) {
        console.error('[ProgressReporter] Error updating progress:', error);
      }
    }, 500);
  }

  stop(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = undefined;
    }
  }

  async updateWithTokens(promptTokens: number, completionTokens: number): Promise<void> {
    if (!this.startTime) return;
    
    const elapsed = Date.now() - this.startTime;
    const seconds = Math.floor(elapsed / 1000);
    const tenths = Math.floor((elapsed % 1000) / 100);
    
    const symbols = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const symbol = symbols[this.updateCount % symbols.length];
    
    const currentAction = `${symbol} Thinking... ${seconds}.${tenths}s (${promptTokens} → ${completionTokens} tokens)`;
    
    try {
      await this.onUpdate({ 
        currentAction,
        startedAt: new Date(this.startTime),
        processor: 'wake'
      });
      this.updateCount++;
    } catch (error) {
      console.error('[ProgressReporter] Error updating progress with tokens:', error);
    }
  }

  addToken(tokens: number): void {
    // For compatibility - tokens are tracked but not displayed in real-time
  }

  updateToolsUsed(tools: string[]): void {
    // For compatibility - tools are tracked separately
  }
}