import { exec } from 'child_process';
import { promisify } from 'util';
import { join, isAbsolute, normalize } from 'path';
import { existsSync } from 'fs';
import type { GitOperations, GitWorktreeInfo } from './types';

const execAsync = promisify(exec);

export class GitWorktreeOperations implements GitOperations {
  constructor(private readonly repoRoot: string) {}

  async listWorktrees(): Promise<GitWorktreeInfo[]> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: this.repoRoot
      });

      const worktrees: GitWorktreeInfo[] = [];
      const lines = stdout.trim().split('\n');
      
      let currentWorktree: Partial<GitWorktreeInfo> = {};
      
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (currentWorktree.path) {
            worktrees.push(currentWorktree as GitWorktreeInfo);
          }
          currentWorktree = { 
            path: line.substring(9),
            isMain: false 
          };
        } else if (line.startsWith('HEAD ')) {
          currentWorktree.commit = line.substring(5);
        } else if (line.startsWith('branch ')) {
          currentWorktree.branch = line.substring(7);
        } else if (line === 'bare') {
          currentWorktree.isMain = true;
        } else if (line === '') {
          if (currentWorktree.path) {
            worktrees.push(currentWorktree as GitWorktreeInfo);
            currentWorktree = {};
          }
        }
      }
      
      if (currentWorktree.path) {
        worktrees.push(currentWorktree as GitWorktreeInfo);
      }

      // Mark main worktree
      if (worktrees.length > 0) {
        const firstWorktree = worktrees[0];
        if (firstWorktree && !firstWorktree.branch) {
          firstWorktree.isMain = true;
        }
      }

      return worktrees;
    } catch (error: any) {
      console.error('[Git] Failed to list worktrees:', error);
      throw new Error(`Failed to list worktrees: ${error.message}`);
    }
  }

  async createWorktree(path: string, branch: string, baseBranch?: string): Promise<void> {
    const absolutePath = isAbsolute(path) ? path : join(this.repoRoot, path);
    
    // Validate path
    if (existsSync(absolutePath)) {
      throw new Error(`Path already exists: ${absolutePath}`);
    }

    try {
      // Check if branch exists
      const branchExists = await execAsync(`git show-ref --verify --quiet refs/heads/${branch}`, {
        cwd: this.repoRoot
      }).then(() => true).catch(() => false);

      if (!branchExists) {
        // Create new branch from base branch or HEAD
        const base = baseBranch || 'HEAD';
        await execAsync(`git branch ${branch} ${base}`, {
          cwd: this.repoRoot
        });
      }

      // Add worktree
      await execAsync(`git worktree add "${absolutePath}" ${branch}`, {
        cwd: this.repoRoot
      });

      console.log(`[Git] Created worktree at ${absolutePath} for branch ${branch}`);
    } catch (error: any) {
      console.error('[Git] Failed to create worktree:', error);
      throw new Error(`Failed to create worktree: ${error.message}`);
    }
  }

  async removeWorktree(path: string): Promise<void> {
    try {
      await execAsync(`git worktree remove "${path}"`, {
        cwd: this.repoRoot
      });

      console.log(`[Git] Removed worktree at ${path}`);
    } catch (error: any) {
      console.error('[Git] Failed to remove worktree:', error);
      throw new Error(`Failed to remove worktree: ${error.message}`);
    }
  }

  async getWorktreeInfo(path: string): Promise<GitWorktreeInfo | null> {
    const worktrees = await this.listWorktrees();
    const normalizedPath = normalize(path);
    
    return worktrees.find(w => normalize(w.path) === normalizedPath) || null;
  }

  async validateWorktreePath(path: string): Promise<boolean> {
    const absolutePath = isAbsolute(path) ? path : join(this.repoRoot, path);
    
    // Check if path is inside repo
    const normalizedRepo = normalize(this.repoRoot);
    const normalizedPath = normalize(absolutePath);
    
    if (!normalizedPath.startsWith(normalizedRepo)) {
      return false;
    }

    // Check if path doesn't exist yet
    return !existsSync(absolutePath);
  }
}