import { describe, test, expect, beforeEach } from 'bun:test';
import { ReadFileTool } from '../read-file';
import * as fs from 'fs/promises';
import * as path from 'path';
import { mkdtemp, rmdir, rm } from 'fs/promises';
import { tmpdir } from 'os';

describe('ReadFileTool', () => {
  let tool: ReadFileTool;
  let testDir: string;
  
  beforeEach(async () => {
    tool = new ReadFileTool();
    // Create a temporary directory for testing
    testDir = await mkdtemp(path.join(tmpdir(), 'read-file-test-'));
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
      expect(tool.name).toBe('read_file');
      expect(tool.description).toBe('Read the contents of a file from the filesystem');
    });
    
    test('should have correct input schema', () => {
      expect(tool.inputSchema).toEqual({
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to read' },
          encoding: {
            type: 'string',
            description: 'File encoding (default: utf8)',
            enum: ['utf8', 'base64', 'hex']
          }
        },
        required: ['path']
      });
    });
  });
  
  describe('execute', () => {
    test('should read file contents successfully', async () => {
      const testFile = path.join(testDir, 'test.txt');
      const mockContent = 'Hello, world!';
      await fs.writeFile(testFile, mockContent);
      
      const result = await tool.execute({ path: testFile });
      
      expect(result).toBe(mockContent);
      
      await cleanup();
    });
    
    test('should handle file read errors', async () => {
      const nonExistentFile = path.join(testDir, 'nonexistent.txt');
      
      await expect(tool.execute({ path: nonExistentFile }))
        .rejects.toThrow(/File not found:/);
      
      await cleanup();
    });
    
    test('should handle missing path parameter', async () => {
      await expect(tool.execute({}))
        .rejects.toThrow('Missing required property: path');
    });
    
    test('should handle large files', async () => {
      const testFile = path.join(testDir, 'large.txt');
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB of content
      await fs.writeFile(testFile, largeContent);
      
      const result = await tool.execute({ path: testFile });
      
      expect(result).toBe(largeContent);
      expect(result.length).toBe(1024 * 1024);
      
      await cleanup();
    });
    
    test('should preserve special characters and encoding', async () => {
      const testFile = path.join(testDir, 'special.txt');
      const specialContent = '👋 Hello\n\tWorld! 🌍\r\n© 2024';
      await fs.writeFile(testFile, specialContent);
      
      const result = await tool.execute({ path: testFile });
      
      expect(result).toBe(specialContent);
      
      await cleanup();
    });
    
    test('should handle empty files', async () => {
      const testFile = path.join(testDir, 'empty.txt');
      await fs.writeFile(testFile, '');
      
      const result = await tool.execute({ path: testFile });
      
      expect(result).toBe('');
      
      await cleanup();
    });
  });
  
  describe('validation', () => {
    test('should validate required path parameter', () => {
      expect(() => tool.validate({ path: '/test.txt' })).not.toThrow();
      expect(() => tool.validate({})).toThrow('Missing required property: path');
      expect(() => tool.validate({ other: 'value' })).toThrow('Missing required property: path');
    });
  });
});