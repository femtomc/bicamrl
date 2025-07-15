import { describe, test, expect, beforeEach } from 'bun:test';
import { ListDirectoryTool } from '../list-directory';
import * as fs from 'fs/promises';
import * as path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';

describe('ListDirectoryTool', () => {
  let tool: ListDirectoryTool;
  let testDir: string;
  
  beforeEach(async () => {
    tool = new ListDirectoryTool();
    // Create a temporary directory for testing
    testDir = await mkdtemp(path.join(tmpdir(), 'list-dir-test-'));
  });
  
  async function cleanup() {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
  
  describe('properties', () => {
    test('should have correct name and description', () => {
      expect(tool.name).toBe('list_directory');
      expect(tool.description).toBe('List files and directories in a given path');
    });
    
    test('should have correct input schema', () => {
      expect(tool.inputSchema).toEqual({
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The directory path to list' },
          recursive: { type: 'boolean', description: 'Whether to list recursively (default: false)' }
        },
        required: ['path']
      });
    });
  });
  
  describe('execute', () => {
    test('should list directory contents successfully', async () => {
      // Create test files and directories
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(testDir, 'file2.js'), 'content2');
      await fs.mkdir(path.join(testDir, 'subdir'));
      await fs.writeFile(path.join(testDir, '.hidden'), 'hidden');
      
      const result = await tool.execute({ path: testDir });
      
      expect(result).toHaveLength(4);
      
      // Check that all entries are present
      const names = result.map((e: any) => e.name);
      expect(names).toContain('file1.txt');
      expect(names).toContain('file2.js');
      expect(names).toContain('subdir');
      expect(names).toContain('.hidden');
      
      // Check types
      const file1 = result.find((e: any) => e.name === 'file1.txt');
      expect(file1?.type).toBe('file');
      expect(file1?.path).toContain('file1.txt');
      
      const subdir = result.find((e: any) => e.name === 'subdir');
      expect(subdir?.type).toBe('directory');
      expect(subdir?.path).toContain('subdir');
      
      await cleanup();
    });
    
    test('should handle empty directories', async () => {
      const result = await tool.execute({ path: testDir });
      
      expect(result).toEqual([]);
      
      await cleanup();
    });
    
    test('should handle directory read errors', async () => {
      const nonExistentDir = path.join(testDir, 'nonexistent');
      
      await expect(tool.execute({ path: nonExistentDir }))
        .rejects.toThrow(/Directory not found:/);
      
      await cleanup();
    });
    
    test('should handle missing path parameter', async () => {
      await expect(tool.execute({} as any))
        .rejects.toThrow('Missing required property: path');
    });
    
    test('should handle nested directories', async () => {
      // Create nested structure
      await fs.mkdir(path.join(testDir, 'dir1'));
      await fs.mkdir(path.join(testDir, 'dir1', 'dir2'));
      await fs.writeFile(path.join(testDir, 'dir1', 'file.txt'), 'content');
      
      const result = await tool.execute({ path: path.join(testDir, 'dir1') });
      
      expect(result).toHaveLength(2);
      
      const names = result.map((e: any) => e.name);
      expect(names).toContain('dir2');
      expect(names).toContain('file.txt');
      
      await cleanup();
    });
    
    test('should handle directories with many files', async () => {
      // Create many files
      const numFiles = 100;
      for (let i = 0; i < numFiles; i++) {
        await fs.writeFile(path.join(testDir, `file${i}.txt`), `content${i}`);
      }
      
      const result = await tool.execute({ path: testDir });
      
      expect(result).toHaveLength(numFiles);
      
      // Check first and last files
      const names = result.map((e: any) => e.name);
      expect(names).toContain('file0.txt');
      expect(names).toContain('file99.txt');
      
      await cleanup();
    });
    
    test('should handle mixed file types', async () => {
      // Create various file types
      await fs.writeFile(path.join(testDir, 'text.txt'), 'text');
      await fs.writeFile(path.join(testDir, 'script.js'), 'js');
      await fs.writeFile(path.join(testDir, 'data.json'), '{}');
      await fs.mkdir(path.join(testDir, 'folder'));
      await fs.symlink('text.txt', path.join(testDir, 'link.txt'));
      
      const result = await tool.execute({ path: testDir });
      
      expect(result.length).toBeGreaterThanOrEqual(4);
      
      // Check file types
      const textFile = result.find((e: any) => e.name === 'text.txt');
      expect(textFile?.type).toBe('file');
      
      const folder = result.find((e: any) => e.name === 'folder');
      expect(folder?.type).toBe('directory');
      
      // Symlinks might be reported as 'file' or 'other' depending on the system
      const link = result.find((e: any) => e.name === 'link.txt');
      expect(link?.type).toBeDefined();
      
      await cleanup();
    });
  });
  
  describe('validation', () => {
    test('should validate required path parameter', () => {
      expect(() => tool.validate({ path: '/test' })).not.toThrow();
      expect(() => tool.validate({} as any)).toThrow('Missing required property: path');
      expect(() => tool.validate({ other: 'value' } as any)).toThrow('Missing required property: path');
    });
  });
});