import { promises as fs } from 'fs';
import { join } from 'path';
import { WorktreeAwareTool } from './worktree-aware-tool';

export class ListDirectoryTool extends WorktreeAwareTool {
  name = 'list_directory';
  description = 'List files and directories in a given path';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'The directory path to list'
      },
      recursive: {
        type: 'boolean',
        description: 'Whether to list recursively (default: false)'
      }
    },
    required: ['path']
  };
  
  async execute(args: { path: string; recursive?: boolean }): Promise<any> {
    this.validate(args);
    
    try {
      // Resolve path relative to worktree if context is set
      const resolvedPath = this.resolvePath(args.path);
      
      if (args.recursive) {
        return await this.listRecursive(resolvedPath);
      } else {
        const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
        return entries.map(entry => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          // Return paths relative to worktree for cleaner output
          path: this.worktreeContext ? 
            this.getRelativePath(join(resolvedPath, entry.name)) : 
            join(args.path, entry.name)
        }));
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Directory not found: ${args.path}`);
      }
      throw new Error(`Failed to list directory: ${error.message}`);
    }
  }
  
  private async listRecursive(dir: string, baseDir: string = dir): Promise<any[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: any[] = [];
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = this.worktreeContext ? 
        this.getRelativePath(fullPath) : 
        fullPath.replace(baseDir + '/', '');
      
      if (entry.isDirectory()) {
        files.push({
          name: entry.name,
          type: 'directory',
          path: relativePath
        });
        const subFiles = await this.listRecursive(fullPath, baseDir);
        files.push(...subFiles);
      } else {
        files.push({
          name: entry.name,
          type: 'file',
          path: relativePath
        });
      }
    }
    
    return files;
  }
}