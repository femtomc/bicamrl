import { describe, test, expect, beforeEach } from 'bun:test';
import { WriteFileTool } from '../write-file';
import * as fs from 'fs/promises';
import * as path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';

describe('WriteFileTool', () => {
  let tool: WriteFileTool;
  let testDir: string;
  
  beforeEach(async () => {
    tool = new WriteFileTool();
    // Create a temporary directory for testing
    testDir = await mkdtemp(path.join(tmpdir(), 'write-file-test-'));
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
      expect(tool.name).toBe('write_file');
      expect(tool.description).toBe('Write content to a file on the filesystem');
    });
    
    test('should have correct input schema', () => {
      expect(tool.inputSchema).toEqual({
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to write to' },
          content: { type: 'string', description: 'The content to write' },
          encoding: {
            type: 'string',
            description: 'File encoding (default: utf8)',
            enum: ['utf8', 'base64', 'hex']
          }
        },
        required: ['path', 'content']
      });
    });
  });
  
  describe('execute', () => {
    test('should write file successfully', async () => {
      const testFile = path.join(testDir, 'test.txt');
      const content = 'Hello, world!';
      
      const result = await tool.execute({
        path: testFile,
        content: content
      });
      
      // Verify file was written
      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent).toBe(content);
      
      expect(result).toBe('Successfully wrote 13 characters to ' + testFile);
      
      await cleanup();
    });
    
    test('should create directories if they don\'t exist', async () => {
      const testFile = path.join(testDir, 'subdir', 'nested', 'test.txt');
      const content = 'test content';
      
      const result = await tool.execute({
        path: testFile,
        content: content
      });
      
      // Verify file was written
      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent).toBe(content);
      
      expect(result).toContain('Successfully wrote');
      expect(result).toContain('characters to');
      
      await cleanup();
    });
    
    test('should handle missing parameters', async () => {
      await expect(tool.execute({ path: '/test.txt' } as any))
        .rejects.toThrow('Missing required property: content');
      
      await expect(tool.execute({ content: 'test' } as any))
        .rejects.toThrow('Missing required property: path');
      
      await expect(tool.execute({} as any))
        .rejects.toThrow('Missing required property: path');
    });
    
    test('should write empty content', async () => {
      const testFile = path.join(testDir, 'empty.txt');
      
      const result = await tool.execute({
        path: testFile,
        content: ''
      });
      
      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent).toBe('');
      
      expect(result).toBe('Successfully wrote 0 characters to ' + testFile);
      
      await cleanup();
    });
    
    test('should handle large content', async () => {
      const testFile = path.join(testDir, 'large.txt');
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      
      const result = await tool.execute({
        path: testFile,
        content: largeContent
      });
      
      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent.length).toBe(1024 * 1024);
      expect(result).toContain('Successfully wrote 1048576 characters');
      
      await cleanup();
    });
    
    test('should preserve special characters', async () => {
      const testFile = path.join(testDir, 'special.txt');
      const specialContent = '👋 Hello\n\tWorld! 🌍\r\n© 2024';
      
      const result = await tool.execute({
        path: testFile,
        content: specialContent
      });
      
      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent).toBe(specialContent);
      expect(result).toContain(`Successfully wrote ${specialContent.length} characters`);
      
      await cleanup();
    });
    
    test('should overwrite existing files', async () => {
      const testFile = path.join(testDir, 'overwrite.txt');
      
      // Write initial content
      await fs.writeFile(testFile, 'old content');
      
      // Overwrite with new content
      const newContent = 'new content';
      const result = await tool.execute({
        path: testFile,
        content: newContent
      });
      
      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent).toBe(newContent);
      expect(result).toContain('Successfully wrote');
      expect(result).toContain('characters to');
      
      await cleanup();
    });
  });
  
  describe('validation', () => {
    test('should validate required parameters', () => {
      expect(() => tool.validate({ path: '/test.txt', content: 'test' })).not.toThrow();
      expect(() => tool.validate({ path: '/test.txt' })).toThrow('Missing required property: content');
      expect(() => tool.validate({ content: 'test' })).toThrow('Missing required property: path');
      expect(() => tool.validate({})).toThrow('Missing required property: path');
    });
  });
});