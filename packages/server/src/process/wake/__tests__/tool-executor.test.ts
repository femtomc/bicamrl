import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { ToolExecutor } from '../tool-executor';
import { ToolRegistry } from '../../../tools';

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  let mockRegistry: ToolRegistry;
  let mockTool: any;
  
  beforeEach(() => {
    mockTool = {
      name: 'read_file',
      description: 'Read a file',
      inputSchema: { path: 'string' },
      execute: mock(() => Promise.resolve({ content: 'test content' }))
    };
    
    mockRegistry = new ToolRegistry();
    mockRegistry.getTool = mock(() => mockTool);
    
    executor = new ToolExecutor(mockRegistry, true);
  });
  
  test('should execute tools successfully', async () => {
    const result = await executor.execute({
      id: 'test-1',
      name: 'read_file',
      arguments: { path: 'test.txt' }
    });
    
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ content: 'test content' });
    expect(mockTool.execute).toHaveBeenCalledWith({ path: 'test.txt' });
  });
  
  test('should map Claude Code tool names', async () => {
    const result = await executor.execute({
      id: 'test-2',
      name: 'Read', // Claude Code name
      arguments: { path: 'test.txt' }
    });
    
    expect(result.success).toBe(true);
    expect(mockRegistry.getTool).toHaveBeenCalledWith('read_file');
  });
  
  test('should handle tool not found', async () => {
    mockRegistry.getTool = mock(() => null as any);
    
    const result = await executor.execute({
      id: 'test-3',
      name: 'unknown_tool',
      arguments: {}
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool unknown_tool not found');
  });
  
  test('should handle tools disabled', async () => {
    executor = new ToolExecutor(mockRegistry, false);
    
    const result = await executor.execute({
      id: 'test-4',
      name: 'read_file',
      arguments: { path: 'test.txt' }
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Tools are not enabled');
  });
  
  test('should handle tool execution errors', async () => {
    mockTool.execute = mock(() => Promise.reject(new Error('File not found')));
    
    const result = await executor.execute({
      id: 'test-5',
      name: 'read_file',
      arguments: { path: 'missing.txt' }
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('File not found');
  });
  
  test('should get tool description', () => {
    const description = executor.getDescription('read_file');
    
    expect(description).toContain('Tool: read_file');
    expect(description).toContain('Description: Read a file');
    expect(description).toContain('Parameters:');
  });
  
  test('should handle all Claude Code tool name mappings', () => {
    const mappings = [
      ['Read', 'read_file'],
      ['Write', 'write_file'],
      ['TodoRead', 'read_file'],
      ['TodoWrite', 'write_file'],
      ['Grep', 'search_files'],
      ['Edit', 'edit_file'],
      ['CreateFile', 'write_file'],
      ['ReadFile', 'read_file'],
      ['WriteFile', 'write_file'],
      ['ListDirectory', 'list_directory'],
      ['ListFiles', 'list_directory']
    ];
    
    for (const [claudeName, expectedName] of mappings) {
      executor.execute({
        id: `test-${claudeName}`,
        name: claudeName!,
        arguments: {}
      });
      
      expect(mockRegistry.getTool).toHaveBeenCalledWith(expectedName);
    }
  });
});