import type { Worktree } from '@bicamrl/shared';

export type { Worktree };

export interface WorktreeStore {
  create(worktree: Omit<Worktree, 'id' | 'createdAt'>): Promise<Worktree>;
  get(id: string): Promise<Worktree | null>;
  getByPath(path: string): Promise<Worktree | null>;
  list(): Promise<Worktree[]>;
  update(id: string, updates: Partial<Worktree>): Promise<Worktree>;
  delete(id: string): Promise<void>;
}

export interface GitWorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
}

export interface GitOperations {
  listWorktrees(): Promise<GitWorktreeInfo[]>;
  createWorktree(path: string, branch: string, baseBranch?: string): Promise<void>;
  removeWorktree(path: string): Promise<void>;
  getWorktreeInfo(path: string): Promise<GitWorktreeInfo | null>;
  validateWorktreePath(path: string): Promise<boolean>;
}