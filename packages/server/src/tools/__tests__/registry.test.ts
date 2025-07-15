import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ToolRegistry, ToolPermissionRequest } from '../registry';
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
  
  execute = jest.fn(async (args: any) => {
    return { result: `Processed: ${args.value}` };
  });
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
      expect(registry.getTool('mock_tool')).toBe(mockTool);
    });
    
    it('should overwrite existing tool with same name', () => {
      const anotherMockTool = new MockTool();
      registry.register(mockTool);
      registry.register(anotherMockTool);
      expect(registry.getTool('mock_tool')).toBe(anotherMockTool);
    });
  });
  
  describe('getTools', () => {
    it('should return empty array when no tools registered', () => {
      expect(registry.getTools()).toEqual([]);
    });
    
    it('should return all registered tools', () => {
      const tool1 = new MockTool();
      const tool2 = new MockTool();
      tool2.name = 'mock_tool_2';
      
      registry.register(tool1);
      registry.register(tool2);
      
      const tools = registry.getTools();
      expect(tools).toHaveLength(2);
      expect(tools).toContain(tool1);
      expect(tools).toContain(tool2);
    });
  });
  
  describe('executeWithPermission', () => {
    beforeEach(() => {
      registry.register(mockTool);
    });
    
    it('should execute tool without permission prompt when none configured', async () => {
      const result = await registry.executeWithPermission('mock_tool', { value: 'test' });
      expect(result).toEqual({ result: 'Processed: test' });
      expect(mockTool.execute).toHaveBeenCalledWith({ value: 'test' });
    });
    
    it('should throw error for non-existent tool', async () => {
      await expect(registry.executeWithPermission('unknown_tool', {}))
        .rejects.toThrow('Tool unknown_tool not found');
    });
    
    it('should request permission when prompt function provided', async () => {
      const permissionPrompt = jest.fn(async (request: ToolPermissionRequest) => ({
        requestId: request.requestId,
        approved: true,
        reason: 'User approved'
      }));
      
      const registryWithPrompt = new ToolRegistry(permissionPrompt);
      registryWithPrompt.register(mockTool);
      
      await registryWithPrompt.executeWithPermission('mock_tool', { value: 'test' }, 'req-123');
      
      expect(permissionPrompt).toHaveBeenCalledWith({
        toolName: 'mock_tool',
        description: 'A mock tool for testing',
        arguments: { value: 'test' },
        requestId: 'req-123'
      });
    });
    
    it('should throw error when permission denied', async () => {
      const permissionPrompt = jest.fn(async () => ({
        requestId: 'req-123',
        approved: false,
        reason: 'User denied access'
      }));
      
      const registryWithPrompt = new ToolRegistry(permissionPrompt);
      registryWithPrompt.register(mockTool);
      
      await expect(registryWithPrompt.executeWithPermission('mock_tool', { value: 'test' }, 'req-123'))
        .rejects.toThrow('Permission denied for tool mock_tool: User denied access');
    });
    
    it('should wrap tool execution errors', async () => {
      mockTool.execute.mockRejectedValueOnce(new Error('Tool failed'));
      
      await expect(registry.executeWithPermission('mock_tool', { value: 'test' }))
        .rejects.toThrow('Tool execution failed: Error: Tool failed');
    });
    
    it('should generate requestId if not provided', async () => {
      const permissionPrompt = jest.fn(async (request: ToolPermissionRequest) => ({
        requestId: request.requestId,
        approved: true
      }));
      
      const registryWithPrompt = new ToolRegistry(permissionPrompt);
      registryWithPrompt.register(mockTool);
      
      await registryWithPrompt.executeWithPermission('mock_tool', { value: 'test' });
      
      expect(permissionPrompt).toHaveBeenCalled();
      const call = permissionPrompt.mock.calls[0][0];
      expect(call.requestId).toBeTruthy();
      expect(typeof call.requestId).toBe('string');
    });
  });
});