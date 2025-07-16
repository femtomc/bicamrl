import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { WorktreeService } from '../worktree-service';
import { WorktreeManager } from '../../worktree/manager';
import { InMemoryWorktreeStore } from '../../worktree/memory-store';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('WorktreeService', () => {
  let service: WorktreeService;
  let worktreeManager: WorktreeManager;
  let testRepoPath: string;

  beforeEach(() => {
    // Create a test git repository
    testRepoPath = `/tmp/test-repo-${Date.now()}`;
    mkdirSync(testRepoPath, { recursive: true });
    
    // Initialize git repo
    execSync('git init', { cwd: testRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: testRepoPath });
    execSync('git config user.name "Test User"', { cwd: testRepoPath });
    execSync('echo "test" > README.md', { cwd: testRepoPath });
    execSync('git add .', { cwd: testRepoPath });
    execSync('git commit -m "Initial commit"', { cwd: testRepoPath });

    // Create worktree manager and service
    const worktreeStore = new InMemoryWorktreeStore();
    worktreeManager = new WorktreeManager(testRepoPath, worktreeStore);
    service = new WorktreeService(worktreeManager);
  });

  afterEach(() => {
    // Clean up test repo
    if (existsSync(testRepoPath)) {
      rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  describe('listWorktrees', () => {
    test('returns main worktree by default', async () => {
      await worktreeManager.initialize();
      const worktrees = await service.listWorktrees();

      expect(worktrees).toHaveLength(1);
      expect(worktrees[0].isMain).toBe(true);
      expect(worktrees[0].path).toBe(testRepoPath);
    });

    test('includes created worktrees', async () => {
      await worktreeManager.initialize();
      
      // Create a worktree
      await service.createWorktree({
        branch: 'feature/test'
      });

      const worktrees = await service.listWorktrees();
      expect(worktrees).toHaveLength(2);
      
      const feature = worktrees.find(w => w.branch === 'feature/test');
      expect(feature).toBeDefined();
      expect(feature?.isMain).toBe(false);
    });
  });

  describe('createWorktree', () => {
    beforeEach(async () => {
      await worktreeManager.initialize();
    });

    test('creates worktree with new branch', async () => {
      const worktree = await service.createWorktree({
        branch: 'feature/new-feature'
      });

      expect(worktree.id).toBeDefined();
      expect(worktree.branch).toBe('feature/new-feature');
      expect(worktree.path).toContain('worktrees/feature-new-feature');
      expect(worktree.isMain).toBe(false);

      // Verify worktree exists on disk
      expect(existsSync(worktree.path)).toBe(true);
      
      // Verify git worktree was created
      const gitWorktrees = execSync('git worktree list', { 
        cwd: testRepoPath,
        encoding: 'utf-8' 
      });
      expect(gitWorktrees).toContain('feature/new-feature');
    });

    test('creates worktree from existing branch', async () => {
      // Create a branch first
      execSync('git checkout -b existing-feature', { cwd: testRepoPath });
      execSync('echo "feature" > feature.txt', { cwd: testRepoPath });
      execSync('git add .', { cwd: testRepoPath });
      execSync('git commit -m "Add feature"', { cwd: testRepoPath });
      execSync('git checkout main', { cwd: testRepoPath });

      // Create worktree from existing branch
      const worktree = await service.createWorktree({
        branch: 'existing-feature',
        checkout: true
      });

      expect(worktree.branch).toBe('existing-feature');
      
      // Verify the feature file exists in the worktree
      const featureFile = join(worktree.path, 'feature.txt');
      expect(existsSync(featureFile)).toBe(true);
    });

    test('generates unique directory names', async () => {
      // Create multiple worktrees with same branch pattern
      const worktree1 = await service.createWorktree({
        branch: 'feature/test'
      });

      const worktree2 = await service.createWorktree({
        branch: 'feature/test-2'
      });

      expect(worktree1.path).not.toBe(worktree2.path);
      expect(existsSync(worktree1.path)).toBe(true);
      expect(existsSync(worktree2.path)).toBe(true);
    });

    test('throws error when branch name is missing', async () => {
      await expect(
        service.createWorktree({} as any)
      ).rejects.toThrow('Branch name is required');
    });

    test('throws error when branch name is invalid', async () => {
      await expect(
        service.createWorktree({
          branch: '../../../etc/passwd'
        })
      ).rejects.toThrow('Invalid branch name');
    });

    test('creates worktree with custom base branch', async () => {
      // Create a base branch
      execSync('git checkout -b develop', { cwd: testRepoPath });
      execSync('echo "develop" > base.txt', { cwd: testRepoPath });
      execSync('git add .', { cwd: testRepoPath });
      execSync('git commit -m "Add base"', { cwd: testRepoPath });
      execSync('git checkout main', { cwd: testRepoPath });

      // Create worktree from develop
      const worktree = await service.createWorktree({
        branch: 'feature/from-develop',
        baseBranch: 'develop'
      });

      // Verify the base file exists in the worktree
      const baseFile = join(worktree.path, 'base.txt');
      expect(existsSync(baseFile)).toBe(true);
    });
  });

  describe('removeWorktree', () => {
    test('removes worktree and cleans up', async () => {
      await worktreeManager.initialize();
      
      // Create a worktree
      const worktree = await service.createWorktree({
        branch: 'feature/to-remove'
      });

      const worktreePath = worktree.path;
      expect(existsSync(worktreePath)).toBe(true);

      // Remove it
      await service.removeWorktree(worktree.id);

      // Verify it's gone
      expect(existsSync(worktreePath)).toBe(false);
      
      const worktrees = await service.listWorktrees();
      const removed = worktrees.find(w => w.id === worktree.id);
      expect(removed).toBeUndefined();
    });

    test('throws error when trying to remove main worktree', async () => {
      await worktreeManager.initialize();
      const worktrees = await service.listWorktrees();
      const main = worktrees.find(w => w.isMain);

      await expect(
        service.removeWorktree(main!.id)
      ).rejects.toThrow('Cannot remove main worktree');
    });

    test('handles non-existent worktree gracefully', async () => {
      await worktreeManager.initialize();
      
      // Should not throw
      await service.removeWorktree('non-existent-id');
    });
  });

  describe('getWorktree', () => {
    test('retrieves worktree by id', async () => {
      await worktreeManager.initialize();
      
      const created = await service.createWorktree({
        branch: 'feature/test'
      });

      const retrieved = await service.getWorktree(created.id);
      expect(retrieved).toEqual(created);
    });

    test('returns null for non-existent worktree', async () => {
      await worktreeManager.initialize();
      
      const retrieved = await service.getWorktree('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('branch validation', () => {
    test('validates branch names', () => {
      const valid = [
        'feature/test',
        'bugfix/issue-123',
        'release/v1.0.0',
        'hotfix-urgent',
        'my_branch',
        'branch.with.dots'
      ];

      const invalid = [
        '',
        ' ',
        '../../../etc',
        'branch with spaces',
        'branch@with@at',
        'branch#with#hash',
        '.hidden',
        'branch/',
        '/branch',
        'branch//double'
      ];

      // All valid names should work
      for (const branch of valid) {
        expect(() => {
          (service as any).validateBranchName(branch);
        }).not.toThrow();
      }

      // All invalid names should throw
      for (const branch of invalid) {
        expect(() => {
          (service as any).validateBranchName(branch);
        }).toThrow('Invalid branch name');
      }
    });
  });
});