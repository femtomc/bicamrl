import type { WorktreeManager } from '../worktree/manager';
import type { Worktree } from '../worktree/types';

export interface CreateWorktreeRequest {
  branch: string;
  baseBranch?: string;
  customPath?: string;
}

export class WorktreeService {
  constructor(private worktreeManager: WorktreeManager) {}

  async listWorktrees(): Promise<Worktree[]> {
    try {
      return await this.worktreeManager.listWorktrees();
    } catch (error) {
      console.error('[WorktreeService] Error listing worktrees:', error);
      throw new Error('Failed to list worktrees');
    }
  }

  async createWorktree(request: CreateWorktreeRequest): Promise<Worktree> {
    const { branch, baseBranch, customPath } = request;
    
    if (!branch) {
      throw new Error('Branch name is required');
    }
    
    try {
      return await this.worktreeManager.createWorktree(branch, baseBranch, customPath);
    } catch (error: any) {
      console.error('[WorktreeService] Error creating worktree:', error);
      throw new Error(error.message || 'Failed to create worktree');
    }
  }

  async getWorktree(id: string): Promise<Worktree | null> {
    try {
      return await this.worktreeManager.getWorktree(id);
    } catch (error) {
      console.error('[WorktreeService] Error getting worktree:', error);
      return null;
    }
  }

  async deleteWorktree(id: string): Promise<void> {
    try {
      await this.worktreeManager.deleteWorktree(id);
    } catch (error) {
      console.error('[WorktreeService] Error deleting worktree:', error);
      throw new Error('Failed to delete worktree');
    }
  }

  async syncWorktrees(): Promise<void> {
    try {
      await this.worktreeManager.syncWithGit();
    } catch (error) {
      console.error('[WorktreeService] Error syncing worktrees:', error);
      throw new Error('Failed to sync worktrees');
    }
  }
}