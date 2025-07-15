import type { Worktree } from '@bicamrl/shared';
import type { WorktreeStore } from './types';
import { v4 as uuidv4 } from 'uuid';

export class InMemoryWorktreeStore implements WorktreeStore {
  private worktrees: Map<string, Worktree> = new Map();

  async create(worktree: Omit<Worktree, 'id' | 'createdAt'>): Promise<Worktree> {
    const newWorktree: Worktree = {
      ...worktree,
      id: uuidv4(),
      createdAt: new Date()
    };
    
    this.worktrees.set(newWorktree.id, newWorktree);
    return newWorktree;
  }

  async get(id: string): Promise<Worktree | null> {
    return this.worktrees.get(id) || null;
  }

  async getByPath(path: string): Promise<Worktree | null> {
    for (const worktree of this.worktrees.values()) {
      if (worktree.path === path) {
        return worktree;
      }
    }
    return null;
  }

  async list(): Promise<Worktree[]> {
    return Array.from(this.worktrees.values());
  }

  async update(id: string, updates: Partial<Worktree>): Promise<Worktree> {
    const worktree = this.worktrees.get(id);
    if (!worktree) {
      throw new Error(`Worktree ${id} not found`);
    }
    
    const updated = { ...worktree, ...updates };
    this.worktrees.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.worktrees.delete(id);
  }
}