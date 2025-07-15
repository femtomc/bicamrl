import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { WorktreeManager } from '../../src/worktree/manager';
import { InMemoryWorktreeStore } from '../../src/worktree/memory-store';
import { GitWorktreeOperations } from '../../src/worktree/git';
import { join } from 'path';

// Mock GitWorktreeOperations
const mockGitOps = {
  listWorktrees: mock(() => Promise.resolve([])),
  createWorktree: mock(() => Promise.resolve()),
  removeWorktree: mock(() => Promise.resolve()),
  getWorktreeInfo: mock(() => Promise.resolve({
    path: '/test/worktree',
    branch: 'test-branch',
    commit: 'abc123',
    isMain: false
  })),
  validateWorktreePath: mock(() => Promise.resolve(true))
};

describe('WorktreeManager', () => {
  let manager: WorktreeManager;
  let store: InMemoryWorktreeStore;
  const testRepoRoot = '/test/repo';

  beforeEach(async () => {
    store = new InMemoryWorktreeStore();
    manager = new WorktreeManager(testRepoRoot, store);
    
    // Replace git operations with mock
    (manager as any).gitOps = mockGitOps;
    
    // Reset mocks
    Object.values(mockGitOps).forEach(m => m.mockClear());
    
    await manager.initialize();
  });

  describe('createWorktree', () => {
    it('should create a new worktree', async () => {
      const branch = 'feature-test';
      const worktree = await manager.createWorktree(branch);

      expect(worktree).toMatchObject({
        branch,
        path: expect.stringContaining('worktrees/feature-test'),
        status: 'active'
      });
      expect(worktree.id).toBeDefined();
      expect(worktree.createdAt).toBeInstanceOf(Date);

      expect(mockGitOps.createWorktree).toHaveBeenCalledWith(
        expect.stringContaining('worktrees/feature-test'),
        branch,
        undefined
      );
    });

    it('should create worktree with custom path', async () => {
      const branch = 'feature-test';
      const customPath = '/test/custom/path';
      
      const worktree = await manager.createWorktree(branch, undefined, customPath);

      expect(worktree.path).toBe('/test/worktree'); // Mock returns this
      expect(mockGitOps.createWorktree).toHaveBeenCalledWith(customPath, branch, undefined);
    });

    it('should create worktree from base branch', async () => {
      const branch = 'feature-test';
      const baseBranch = 'main';
      
      await manager.createWorktree(branch, baseBranch);

      expect(mockGitOps.createWorktree).toHaveBeenCalledWith(
        expect.any(String),
        branch,
        baseBranch
      );
    });

    it('should throw error for invalid path', async () => {
      mockGitOps.validateWorktreePath.mockResolvedValueOnce(false);
      
      await expect(manager.createWorktree('test')).rejects.toThrow('Invalid worktree path');
    });
  });

  describe('getWorktree', () => {
    it('should retrieve worktree by id', async () => {
      const created = await manager.createWorktree('test-branch');
      const retrieved = await manager.getWorktree(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent worktree', async () => {
      const retrieved = await manager.getWorktree('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('listWorktrees', () => {
    it('should list all worktrees', async () => {
      await manager.createWorktree('branch1');
      await manager.createWorktree('branch2');

      const worktrees = await manager.listWorktrees();
      expect(worktrees).toHaveLength(2);
      expect(worktrees[0].branch).toBe('test-branch'); // Mock always returns this
      expect(worktrees[1].branch).toBe('test-branch');
    });
  });

  describe('deleteWorktree', () => {
    it('should delete worktree', async () => {
      const worktree = await manager.createWorktree('test-branch');
      await manager.deleteWorktree(worktree.id);

      const retrieved = await manager.getWorktree(worktree.id);
      expect(retrieved).toBeNull();
      expect(mockGitOps.removeWorktree).toHaveBeenCalledWith(worktree.path);
    });

    it('should throw error for non-existent worktree', async () => {
      await expect(manager.deleteWorktree('non-existent')).rejects.toThrow('Worktree non-existent not found');
    });
  });

  describe('syncWithGit', () => {
    it('should discover existing Git worktrees', async () => {
      mockGitOps.listWorktrees.mockResolvedValueOnce([
        {
          path: '/test/existing',
          branch: 'existing-branch',
          commit: 'xyz789',
          isMain: false
        }
      ]);

      await manager.syncWithGit();
      
      const worktrees = await manager.listWorktrees();
      expect(worktrees).toHaveLength(1);
      expect(worktrees[0].path).toBe('/test/existing');
    });

    it('should mark missing worktrees as inactive', async () => {
      const worktree = await manager.createWorktree('test-branch');
      
      // Simulate worktree removal from Git
      mockGitOps.listWorktrees.mockResolvedValueOnce([]);
      
      await manager.syncWithGit();
      
      const updated = await manager.getWorktree(worktree.id);
      expect(updated?.status).toBe('inactive');
    });
  });

  describe('createContext', () => {
    it('should create context for valid worktree', async () => {
      const worktree = await manager.createWorktree('test-branch');
      const context = manager.createContext('session-123', worktree.id);

      expect(context).toEqual({
        sessionId: 'session-123',
        worktreeId: worktree.id,
        worktreePath: worktree.path
      });
    });

    it('should return null for invalid worktree', () => {
      const context = manager.createContext('session-123', 'non-existent');
      expect(context).toBeNull();
    });
  });
});