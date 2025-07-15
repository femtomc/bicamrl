import { promises as fs } from 'fs';
import { WorktreeAwareTool } from './worktree-aware-tool';

export class ReadFileTool extends WorktreeAwareTool {
  name = 'read_file';
  description = 'Read the contents of a file from the filesystem';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'The file path to read'
      },
      encoding: {
        type: 'string',
        description: 'File encoding (default: utf8)',
        enum: ['utf8', 'base64', 'hex']
      }
    },
    required: ['path']
  };
  
  async execute(args: { path: string; encoding?: BufferEncoding }): Promise<string> {
    this.validate(args);
    
    try {
      // Resolve path relative to worktree if context is set
      const resolvedPath = this.resolvePath(args.path);
      const content = await fs.readFile(resolvedPath, args.encoding || 'utf8');
      return content;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${args.path}`);
      }
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }
}