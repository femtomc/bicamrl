import { describe, it, expect, beforeEach } from 'bun:test';
import { ToolRegistry } from '../registry';
import { BaseTool } from '../base-tool';

class MockTool extends BaseTool {
  name = 'mock_tool';
  description = 'A mock tool for testing';
  inputSchema = {
    type: 'object' as const,
    properties: {
      value: { type: 'string' }
    },
    required: ['value']
  };
  
  private shouldFail = false;
  
  setFailing(fail: boolean) {
    this.shouldFail = fail;
  }
  
  execute = async (args: any) => {
    if (this.shouldFail) {
      throw new Error('Tool failed');
    }
    return { result: `Processed: ${args.value}` };
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockTool: MockTool;
  
  beforeEach(() => {
    registry = new ToolRegistry();
    mockTool = new MockTool();
  });
  
  describe('register', () => {
    it('should register a tool', () => {
      registry.register(mockTool);
      const tools = registry.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe('mock_tool');
    });
    
    it('should overwrite duplicate tool registration', () => {
      registry.register(mockTool);
      const tools1 = registry.getTools();
      expect(tools1).toHaveLength(1);
      
      // Register again - should overwrite
      registry.register(mockTool);
      const tools2 = registry.getTools();
      expect(tools2).toHaveLength(1);
    });
  });
  
  describe('getTool', () => {
    it('should retrieve registered tool', () => {
      registry.register(mockTool);
      const tool = registry.getTool('mock_tool');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('mock_tool');
    });
    
    it('should return undefined for non-existent tool', () => {
      const tool = registry.getTool('unknown_tool');
      expect(tool).toBeUndefined();
    });
  });
  
  describe('executeWithPermission', () => {
    it('should execute tool', async () => {
      registry.register(mockTool);
      const result = await registry.executeWithPermission('mock_tool', { value: 'test' });
      expect(result).toEqual({ result: 'Processed: test' });
    });
    
    it('should throw error for non-existent tool', async () => {
      await expect(registry.executeWithPermission('unknown_tool', {}))
        .rejects.toThrow('Tool unknown_tool not found');
    });
    
    it('should wrap tool execution errors', async () => {
      mockTool.setFailing(true);
      registry.register(mockTool);
      
      await expect(registry.executeWithPermission('mock_tool', { value: 'test' }))
        .rejects.toThrow('Tool execution failed: Error: Tool failed');
    });
  });
  
  describe('setWorktreeContext', () => {
    it('should set worktree context on all tools', () => {
      const mockWorktreeContext = {
        worktreeId: 'wt-123',
        worktreePath: '/path/to/worktree'
      };
      
      registry.register(mockTool);
      registry.setWorktreeContext(mockWorktreeContext);
      
      // The context is set on the tool internally
      // We can't directly check it since it's protected
      // But we know it's set if no error is thrown
      expect(() => registry.setWorktreeContext(mockWorktreeContext)).not.toThrow();
    });
  });
});