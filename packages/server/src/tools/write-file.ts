import { promises as fs } from 'fs';
import { dirname } from 'path';
import { WorktreeAwareTool } from './worktree-aware-tool';

export class WriteFileTool extends WorktreeAwareTool {
  name = 'write_file';
  description = 'Write content to a file on the filesystem';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'The file path to write to'
      },
      content: {
        type: 'string',
        description: 'The content to write'
      },
      encoding: {
        type: 'string',
        description: 'File encoding (default: utf8)',
        enum: ['utf8', 'base64', 'hex']
      }
    },
    required: ['path', 'content']
  };
  
  async execute(args: { path: string; content: string; encoding?: BufferEncoding }): Promise<string> {
    this.validate(args);
    
    try {
      // Resolve path relative to worktree if context is set
      const resolvedPath = this.resolvePath(args.path);
      
      // Ensure directory exists
      const dir = dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write file
      await fs.writeFile(resolvedPath, args.content, args.encoding || 'utf8');
      
      // Return message with original path for clarity
      return `Successfully wrote ${args.content.length} characters to ${args.path}`;
    } catch (error: any) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }
}