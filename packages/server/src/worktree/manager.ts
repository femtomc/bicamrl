import type { Worktree, WorktreeContext } from '@bicamrl/shared';
import { v4 as uuidv4 } from 'uuid';
import { GitWorktreeOperations } from './git';
import type { WorktreeStore } from './types';
import { join } from 'path';

export class WorktreeManager {
  private gitOps: GitWorktreeOperations;
  private worktrees: Map<string, Worktree> = new Map();

  constructor(
    private readonly repoRoot: string,
    private readonly store?: WorktreeStore
  ) {
    this.gitOps = new GitWorktreeOperations(repoRoot);
  }

  async initialize(): Promise<void> {
    // Load existing worktrees from store if available
    if (this.store) {
      const stored = await this.store.list();
      for (const worktree of stored) {
        this.worktrees.set(worktree.id, worktree);
      }
    }

    // Sync with actual Git worktrees
    await this.syncWithGit();
  }

  async createWorktree(branch: string, baseBranch?: string, customPath?: string): Promise<Worktree> {
    // Generate path if not provided
    const path = customPath || join(this.repoRoot, 'worktrees', branch);
    
    // Validate path
    const isValid = await this.gitOps.validateWorktreePath(path);
    if (!isValid) {
      throw new Error(`Invalid worktree path: ${path}`);
    }

    // Create Git worktree
    await this.gitOps.createWorktree(path, branch, baseBranch);

    // Get worktree info
    const gitInfo = await this.gitOps.getWorktreeInfo(path);
    if (!gitInfo) {
      throw new Error('Failed to get worktree info after creation');
    }

    // Create worktree record
    const worktree: Worktree = {
      id: uuidv4(),
      path: gitInfo.path,
      branch: gitInfo.branch,
      baseCommit: gitInfo.commit,
      status: 'active',
      createdAt: new Date()
    };

    // Store in memory and persist
    this.worktrees.set(worktree.id, worktree);
    if (this.store) {
      await this.store.create(worktree);
    }

    console.log(`[WorktreeManager] Created worktree ${worktree.id} at ${worktree.path}`);
    return worktree;
  }

  async getWorktree(id: string): Promise<Worktree | null> {
    return this.worktrees.get(id) || null;
  }

  async getWorktreeByPath(path: string): Promise<Worktree | null> {
    for (const worktree of this.worktrees.values()) {
      if (worktree.path === path) {
        return worktree;
      }
    }
    return null;
  }

  async listWorktrees(): Promise<Worktree[]> {
    return Array.from(this.worktrees.values());
  }

  async deleteWorktree(id: string): Promise<void> {
    const worktree = this.worktrees.get(id);
    if (!worktree) {
      throw new Error(`Worktree ${id} not found`);
    }

    // Remove Git worktree
    await this.gitOps.removeWorktree(worktree.path);

    // Remove from memory and store
    this.worktrees.delete(id);
    if (this.store) {
      await this.store.delete(id);
    }

    console.log(`[WorktreeManager] Deleted worktree ${id}`);
  }

  async syncWithGit(): Promise<void> {
    const gitWorktrees = await this.gitOps.listWorktrees();
    
    // Find Git worktrees not in our records
    for (const gitWorktree of gitWorktrees) {
      if (gitWorktree.isMain) continue; // Skip main worktree
      
      const existing = await this.getWorktreeByPath(gitWorktree.path);
      if (!existing) {
        // Create record for existing Git worktree
        const worktree: Worktree = {
          id: uuidv4(),
          path: gitWorktree.path,
          branch: gitWorktree.branch,
          baseCommit: gitWorktree.commit,
          status: 'active',
          createdAt: new Date()
        };

        this.worktrees.set(worktree.id, worktree);
        if (this.store) {
          await this.store.create(worktree);
        }

        console.log(`[WorktreeManager] Discovered existing worktree at ${worktree.path}`);
      }
    }

    // Mark missing worktrees as inactive
    for (const [id, worktree] of this.worktrees.entries()) {
      const gitInfo = gitWorktrees.find(w => w.path === worktree.path);
      if (!gitInfo && worktree.status === 'active') {
        const updatedWorktree = { ...worktree, status: 'inactive' as const };
        this.worktrees.set(id, updatedWorktree);
        if (this.store) {
          await this.store.update(worktree.id, { status: 'inactive' });
        }
        console.log(`[WorktreeManager] Marked worktree ${worktree.id} as inactive`);
      }
    }
  }

  createContext(worktreeId: string): WorktreeContext | null {
    const worktree = this.worktrees.get(worktreeId);
    if (!worktree) {
      return null;
    }

    return {
      worktreeId: worktree.id,
      worktreePath: worktree.path
    };
  }
}