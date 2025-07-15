import { LLMTool } from '../llm/service';

export abstract class BaseTool implements LLMTool {
  abstract name: string;
  abstract description: string;
  abstract inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  
  abstract execute(args: any): Promise<any>;
  
  validate(args: any): void {
    // Basic validation against schema
    if (this.inputSchema.required) {
      for (const prop of this.inputSchema.required) {
        if (!(prop in args)) {
          throw new Error(`Missing required property: ${prop}`);
        }
      }
    }
  }
}