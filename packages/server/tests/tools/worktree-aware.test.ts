import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ReadFileTool } from '../../src/tools/read-file';
import { WriteFileTool } from '../../src/tools/write-file';
import { ListDirectoryTool } from '../../src/tools/list-directory';
import type { WorktreeContext } from '@bicamrl/shared';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';

describe('Worktree-Aware Tools', () => {
  let testDir: string;
  let worktreeDir: string;
  let context: WorktreeContext;

  beforeEach(async () => {
    // Create test directories
    testDir = join(tmpdir(), `bicamrl-test-${uuidv4()}`);
    worktreeDir = join(testDir, 'worktree');
    
    await fs.mkdir(worktreeDir, { recursive: true });
    
    context = {
      sessionId: 'test-session',
      worktreeId: 'test-worktree',
      worktreePath: worktreeDir
    };
  });

  afterEach(async () => {
    // Clean up test directories
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('ReadFileTool with worktree context', () => {
    let tool: ReadFileTool;

    beforeEach(() => {
      tool = new ReadFileTool();
      tool.setWorktreeContext(context);
    });

    it('should read file with relative path', async () => {
      const content = 'Hello from worktree';
      await fs.writeFile(join(worktreeDir, 'test.txt'), content);

      const result = await tool.execute({ path: 'test.txt' });
      expect(result).toBe(content);
    });

    it('should read file with absolute path within worktree', async () => {
      const content = 'Hello from absolute path';
      const filePath = join(worktreeDir, 'test.txt');
      await fs.writeFile(filePath, content);

      const result = await tool.execute({ path: filePath });
      expect(result).toBe(content);
    });

    it('should throw error for path outside worktree', async () => {
      const outsidePath = join(testDir, 'outside.txt');
      await fs.writeFile(outsidePath, 'outside content');

      await expect(tool.execute({ path: outsidePath }))
        .rejects.toThrow('outside worktree boundary');
    });

    it('should work without worktree context', async () => {
      tool.setWorktreeContext(undefined);
      
      const filePath = join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'no context');

      const result = await tool.execute({ path: filePath });
      expect(result).toBe('no context');
    });
  });

  describe('WriteFileTool with worktree context', () => {
    let tool: WriteFileTool;

    beforeEach(() => {
      tool = new WriteFileTool();
      tool.setWorktreeContext(context);
    });

    it('should write file with relative path', async () => {
      const content = 'Written to worktree';
      const result = await tool.execute({ 
        path: 'output.txt', 
        content 
      });

      expect(result).toContain('Successfully wrote');
      
      const written = await fs.readFile(join(worktreeDir, 'output.txt'), 'utf8');
      expect(written).toBe(content);
    });

    it('should create nested directories', async () => {
      const content = 'Nested content';
      await tool.execute({ 
        path: 'nested/deep/file.txt', 
        content 
      });

      const written = await fs.readFile(
        join(worktreeDir, 'nested/deep/file.txt'), 
        'utf8'
      );
      expect(written).toBe(content);
    });

    it('should throw error for path outside worktree', async () => {
      const outsidePath = join(testDir, 'outside.txt');

      await expect(tool.execute({ 
        path: outsidePath, 
        content: 'outside' 
      })).rejects.toThrow('outside worktree boundary');
    });
  });

  describe('ListDirectoryTool with worktree context', () => {
    let tool: ListDirectoryTool;

    beforeEach(async () => {
      tool = new ListDirectoryTool();
      tool.setWorktreeContext(context);

      // Create test structure
      await fs.mkdir(join(worktreeDir, 'dir1'), { recursive: true });
      await fs.mkdir(join(worktreeDir, 'dir2'), { recursive: true });
      await fs.writeFile(join(worktreeDir, 'file1.txt'), 'content1');
      await fs.writeFile(join(worktreeDir, 'dir1/file2.txt'), 'content2');
    });

    it('should list directory with relative path', async () => {
      const result = await tool.execute({ path: '.' });
      
      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'dir1', type: 'directory' }),
          expect.objectContaining({ name: 'dir2', type: 'directory' }),
          expect.objectContaining({ name: 'file1.txt', type: 'file' })
        ])
      );
    });

    it('should return relative paths from worktree root', async () => {
      const result = await tool.execute({ path: '.' });
      
      // Paths should be relative to worktree
      const dir1Entry = result.find((e: any) => e.name === 'dir1');
      expect(dir1Entry.path).toBe('dir1');
    });

    it('should list recursively with relative paths', async () => {
      const result = await tool.execute({ path: '.', recursive: true });
      
      const file2Entry = result.find((e: any) => e.name === 'file2.txt');
      expect(file2Entry).toBeDefined();
      expect(file2Entry.path).toBe('dir1/file2.txt');
    });

    it('should throw error for path outside worktree', async () => {
      await expect(tool.execute({ path: testDir }))
        .rejects.toThrow('outside worktree boundary');
    });
  });
});