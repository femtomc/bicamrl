import { BaseTool } from './base-tool';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class BashTool extends BaseTool {
  name = 'Bash';
  description = 'Execute bash commands';

  async execute(args: any, worktreeContext?: any): Promise<string> {
    const { command, timeout = 120000 } = args;
    
    if (!command) {
      throw new Error('Command is required');
    }

    console.log(`[BashTool] Executing: ${command}`);
    
    try {
      // Execute in worktree directory if provided
      const cwd = worktreeContext?.path || process.cwd();
      
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: 30000, // 30KB max output
        env: { ...process.env }
      });
      
      if (stderr && !stdout) {
        return stderr;
      }
      
      return stdout || 'Command completed successfully';
    } catch (error: any) {
      if (error.killed) {
        throw new Error(`Command timed out after ${timeout}ms`);
      }
      
      // Return error output if available
      if (error.stderr) {
        return error.stderr;
      }
      
      throw new Error(`Command failed: ${error.message}`);
    }
  }
}