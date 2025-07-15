import { BaseTool } from './base-tool';
import type { WorktreeContext } from '@bicamrl/shared';
import { join, isAbsolute, normalize, relative } from 'path';

export abstract class WorktreeAwareTool extends BaseTool {
  protected worktreeContext?: WorktreeContext;

  setWorktreeContext(context: WorktreeContext | undefined): void {
    this.worktreeContext = context;
  }

  protected resolvePath(inputPath: string): string {
    // If no worktree context, return as-is (backward compatibility)
    if (!this.worktreeContext) {
      return inputPath;
    }

    // If already absolute, validate it's within worktree
    if (isAbsolute(inputPath)) {
      const normalizedInput = normalize(inputPath);
      const normalizedWorktree = normalize(this.worktreeContext.worktreePath);
      
      if (!normalizedInput.startsWith(normalizedWorktree)) {
        throw new Error(`Path '${inputPath}' is outside worktree boundary`);
      }
      
      return inputPath;
    }

    // Resolve relative to worktree root
    return join(this.worktreeContext.worktreePath, inputPath);
  }

  protected validatePathInWorktree(path: string): void {
    if (!this.worktreeContext) {
      return;
    }

    const resolvedPath = normalize(path);
    const worktreePath = normalize(this.worktreeContext.worktreePath);
    
    if (!resolvedPath.startsWith(worktreePath)) {
      throw new Error(`Path '${path}' is outside worktree boundary`);
    }
  }

  protected getRelativePath(absolutePath: string): string {
    if (!this.worktreeContext) {
      return absolutePath;
    }

    return relative(this.worktreeContext.worktreePath, absolutePath);
  }
}