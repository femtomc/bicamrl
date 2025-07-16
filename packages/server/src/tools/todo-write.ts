import { BaseTool } from './base';

export class TodoWriteTool extends BaseTool {
  name = 'todo_write';
  description = 'Write or update a todo list';

  async execute(args: any): Promise<string> {
    const { todos } = args;
    
    if (!todos || !Array.isArray(todos)) {
      throw new Error('todos array is required');
    }

    console.log(`[TodoWriteTool] Received ${todos.length} todos`);
    
    // For now, just acknowledge the todos were received
    // In a real implementation, this would persist to a todo list
    const summary = todos.map((todo: any) => 
      `- [${todo.status}] ${todo.content} (${todo.priority})`
    ).join('\n');
    
    return `Todo list updated with ${todos.length} items:\n${summary}`;
  }
}