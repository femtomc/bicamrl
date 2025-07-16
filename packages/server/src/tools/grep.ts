import { BaseTool } from './base-tool';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GrepTool extends BaseTool {
  name = 'grep';
  description = 'Search for patterns in files';

  async execute(args: any, worktreeContext?: any): Promise<string> {
    const { pattern, path, include } = args;
    
    if (!pattern) {
      throw new Error('Pattern is required');
    }

    const cwd = worktreeContext?.path || process.cwd();
    const searchPath = path || cwd;
    
    // Build ripgrep command
    let command = `rg "${pattern}" "${searchPath}"`;
    
    if (include) {
      // Handle glob patterns like *.{md,ts,rs}
      command += ` -g "${include}"`;
    }
    
    console.log(`[GrepTool] Executing: ${command}`);
    
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        maxBuffer: 100000, // 100KB max output
        env: { ...process.env }
      });
      
      if (stderr && !stdout) {
        return stderr;
      }
      
      return stdout || 'No matches found';
    } catch (error: any) {
      if (error.code === 1) {
        // ripgrep returns exit code 1 when no matches found
        return 'No matches found';
      }
      
      throw new Error(`Search failed: ${error.message}`);
    }
  }
}