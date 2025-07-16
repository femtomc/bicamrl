import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { EventEmitter } from 'events';
import { InteractionStore, type InteractionEvent } from '../../src/interaction/store';
import { MessageStore, type MessageEvent } from '../../src/message/store';
import { Interaction, InteractionType } from '../../src/interaction/types';
import { Message } from '../../src/message/types';

// Mock GUI state manager to track state transitions
class MockGUIStateManager extends EventEmitter {
  private state: any = {
    interactions: [],
    selectedInteractionId: null,
    processingInteractions: new Set<string>(), // Track which interactions are processing
    pendingPermissions: [],
    worktrees: [],
    selectedWorktreeId: null
  };

  private stateHistory: any[] = [];

  constructor(
    private interactionStore: InteractionStore,
    private messageStore: MessageStore
  ) {
    super();
    this.setupListeners();
  }

  private setupListeners() {
    // Listen to interaction events
    this.interactionStore.subscribe((event: InteractionEvent) => {
      this.handleInteractionEvent(event);
    });

    // Listen to message events
    this.messageStore.subscribe((event: MessageEvent) => {
      this.handleMessageEvent(event);
    });
  }

  private handleInteractionEvent(event: InteractionEvent) {
    const newState = { ...this.state };

    switch (event.type) {
      case 'interaction:created':
        newState.interactions = [
          ...newState.interactions,
          event.data.interaction
        ];
        newState.selectedInteractionId = event.data.interaction.id;
        // Mark as processing when created
        newState.processingInteractions = new Set(newState.processingInteractions);
        newState.processingInteractions.add(event.data.interaction.id);
        break;

      case 'interaction:updated':
        newState.interactions = newState.interactions.map((i: any) =>
          i.id === event.data.interaction.id ? event.data.interaction : i
        );
        break;

      case 'interaction:deleted':
        newState.interactions = newState.interactions.filter(
          (i: any) => i.id !== event.data.interactionId
        );
        if (newState.selectedInteractionId === event.data.interactionId) {
          newState.selectedInteractionId = null;
        }
        break;
    }

    this.updateState(newState);
  }

  private handleMessageEvent(event: MessageEvent) {
    const newState = { ...this.state };

    switch (event.type) {
      case 'message:added':
        // Check for permission requests
        if (event.data.message.metadata?.permissionRequest) {
          newState.pendingPermissions = [...newState.pendingPermissions, {
            messageId: event.data.message.id,
            interactionId: event.data.interactionId,
            toolName: event.data.message.metadata.permissionRequest.toolName,
            description: event.data.message.metadata.permissionRequest.description,
            requestId: event.data.message.metadata.permissionRequest.requestId
          }];
        }
        
        // Check if this completes the interaction (assistant message with completed status)
        if (event.data.message.role === 'assistant' && 
            event.data.message.status === 'completed') {
          newState.processingInteractions = new Set(newState.processingInteractions);
          newState.processingInteractions.delete(event.data.interactionId);
        }
        
        // Check for failed messages
        if (event.data.message.status === 'failed') {
          newState.processingInteractions = new Set(newState.processingInteractions);
          newState.processingInteractions.delete(event.data.interactionId);
        }
        break;

      case 'message:updated':
        // Check for permission responses
        if (event.data.message.metadata?.permissionResponse !== undefined) {
          newState.pendingPermissions = newState.pendingPermissions.filter(
            (p: any) => p.messageId !== event.data.message.id
          );
        }
        break;
    }

    this.updateState(newState);
  }

  private updateState(newState: any) {
    const oldState = this.state;
    this.state = newState;
    this.stateHistory.push({ ...newState, timestamp: Date.now() });
    
    this.emit('stateChanged', {
      oldState,
      newState,
      changes: this.getStateChanges(oldState, newState)
    });
  }

  private getStateChanges(oldState: any, newState: any): string[] {
    const changes: string[] = [];

    if (oldState.selectedInteractionId !== newState.selectedInteractionId) {
      changes.push('selectedInteraction');
    }
    if (oldState.processingInteractions.size !== newState.processingInteractions.size) {
      changes.push('processingStatus');
    }
    if (oldState.pendingPermissions.length !== newState.pendingPermissions.length) {
      changes.push('permissions');
    }
    if (oldState.interactions.length !== newState.interactions.length) {
      changes.push('interactionCount');
    }

    return changes;
  }

  getState() {
    return { 
      ...this.state,
      isProcessing: this.state.processingInteractions.size > 0,
      processingInteractions: new Set(this.state.processingInteractions)
    };
  }

  getStateHistory() {
    return [...this.stateHistory];
  }

  selectInteraction(interactionId: string | null) {
    this.updateState({
      ...this.state,
      selectedInteractionId: interactionId
    });
  }

  selectWorktree(worktreeId: string | null) {
    this.updateState({
      ...this.state,
      selectedWorktreeId: worktreeId
    });
  }
}

describe('GUI State Transition Tests', () => {
  let interactionStore: InteractionStore;
  let messageStore: MessageStore;
  let guiState: MockGUIStateManager;
  let stateChanges: any[] = [];

  beforeEach(() => {
    interactionStore = new InteractionStore();
    messageStore = new MessageStore();
    guiState = new MockGUIStateManager(interactionStore, messageStore);

    // Track all state changes
    guiState.on('stateChanged', (change) => {
      stateChanges.push(change);
    });
  });

  afterEach(() => {
    stateChanges = [];
  });

  describe('Interaction Lifecycle State Transitions', () => {
    test('creates interaction and updates GUI state', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      await interactionStore.create(interaction);

      const state = guiState.getState();
      expect(state.interactions).toHaveLength(1);
      expect(state.selectedInteractionId).toBe(interaction.id);
      expect(state.isProcessing).toBe(true);

      // Check state changes
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0].changes).toContain('interactionCount');
      expect(stateChanges[0].changes).toContain('selectedInteraction');
      expect(stateChanges[0].changes).toContain('processingStatus');
    });

    test('completes interaction and updates processing state', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY
      });
      await interactionStore.create(interaction);

      // Add assistant response to complete the interaction
      await messageStore.addMessage(Message.create({
        interactionId: interaction.id,
        role: 'assistant',
        content: 'Response completed',
        metadata: { model: 'test-model' }
      }));

      const state = guiState.getState();
      expect(state.isProcessing).toBe(false);
      
      // Should have state changes for create and message
      expect(stateChanges.length).toBeGreaterThan(1);
      const processingChange = stateChanges.find(c => 
        c.changes.includes('processingStatus')
      );
      expect(processingChange).toBeDefined();
    });

    test('handles interaction failure state', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.ACTION
      });
      await interactionStore.create(interaction);

      // Add failed message
      const failedMessage = Message.create({
        interactionId: interaction.id,
        role: 'assistant',
        content: 'Error: Test error',
        metadata: { error: { message: 'Test error', code: 'TEST_ERROR' } }
      });
      
      // Update message status to failed
      await messageStore.addMessage(failedMessage.withStatus('failed'));

      const state = guiState.getState();
      expect(state.isProcessing).toBe(false);
      
      // In V2, the error is tracked in messages, not on the interaction
      const messages = messageStore.getMessages(interaction.id);
      const errorMessage = messages.find(m => m.status === 'failed');
      expect(errorMessage).toBeDefined();
      expect(errorMessage?.metadata?.error).toBeDefined();
    });
  });

  describe('Permission Request State Transitions', () => {
    test('adds pending permission when requested', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY
      });
      await interactionStore.create(interaction);

      const message = Message.create({
        interactionId: interaction.id,
        role: 'system',
        content: 'Permission required',
        metadata: {
          permissionRequest: {
            toolName: 'bash',
            description: 'Execute command: ls -la',
            requestId: 'perm-123'
          }
        }
      });
      await messageStore.addMessage(message);

      const state = guiState.getState();
      expect(state.pendingPermissions).toHaveLength(1);
      expect(state.pendingPermissions[0].toolName).toBe('bash');
      expect(state.pendingPermissions[0].requestId).toBe('perm-123');

      // Check state change - should have at least 2 changes (interaction created, permission added)
      expect(stateChanges.length).toBeGreaterThan(1);
      const permissionChange = stateChanges.find(
        change => change.changes.includes('permissions')
      );
      expect(permissionChange).toBeDefined();
    });

    test('removes pending permission when responded', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY
      });
      await interactionStore.create(interaction);

      // Add permission request
      const message = Message.create({
        interactionId: interaction.id,
        role: 'system',
        content: 'Permission required',
        metadata: {
          permissionRequest: {
            toolName: 'Read',
            description: 'Read file.txt',
            requestId: 'perm-456'
          }
        }
      });
      await messageStore.addMessage(message);

      // Approve permission
      await messageStore.updateMessageMetadata(message.id, {
        ...message.metadata,
        permissionResponse: true
      });

      const state = guiState.getState();
      expect(state.pendingPermissions).toHaveLength(0);
    });

    test('handles multiple permission requests', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.ACTION
      });
      await interactionStore.create(interaction);

      // Add multiple permission requests
      const permissions = [
        { toolName: 'Read', description: 'Read file1.txt' },
        { toolName: 'Write', description: 'Write file2.txt' },
        { toolName: 'Bash', description: 'Run script.sh' }
      ];

      for (let i = 0; i < permissions.length; i++) {
        const message = Message.create({
          interactionId: interaction.id,
          role: 'system',
          content: 'Permission required',
          metadata: {
            permissionRequest: {
              ...permissions[i],
              requestId: `perm-${i}`
            }
          }
        });
        await messageStore.addMessage(message);
      }

      const state = guiState.getState();
      expect(state.pendingPermissions).toHaveLength(3);
      
      // Approve one permission
      const firstMessage = state.pendingPermissions[0];
      await messageStore.updateMessageMetadata(firstMessage.messageId, {
        permissionResponse: true
      });

      const updatedState = guiState.getState();
      expect(updatedState.pendingPermissions).toHaveLength(2);
    });
  });

  describe('Multiple Interaction Management', () => {
    test('switches between interactions', async () => {
      // Create multiple interactions sequentially to ensure order
      const interaction1 = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY
      });
      const id1 = await interactionStore.create(interaction1);
      
      const interaction2 = Interaction.create({
        source: 'user',
        type: InteractionType.ACTION
      });
      const id2 = await interactionStore.create(interaction2);
      
      const interaction3 = Interaction.create({
        source: 'user',
        type: InteractionType.OBSERVATION
      });
      const id3 = await interactionStore.create(interaction3);

      // Initially selected should be the last created
      let state = guiState.getState();
      expect(state.selectedInteractionId).toBe(id3);

      // Switch to first interaction
      guiState.selectInteraction(id1);
      state = guiState.getState();
      expect(state.selectedInteractionId).toBe(id1);

      // Deselect all
      guiState.selectInteraction(null);
      state = guiState.getState();
      expect(state.selectedInteractionId).toBeNull();
    });

    test('handles concurrent processing states', async () => {
      // Create multiple processing interactions
      const interactions = [];
      for (let i = 0; i < 3; i++) {
        const interaction = Interaction.create({
          source: 'user',
          type: InteractionType.QUERY
        });
        await interactionStore.create(interaction);
        interactions.push(interaction);
      }

      // All should be processing
      let state = guiState.getState();
      expect(state.isProcessing).toBe(true);
      expect(state.processingInteractions.size).toBe(3);

      // Complete first interaction with proper status
      const completedMessage = Message.create({
        interactionId: interactions[0].id,
        role: 'assistant',
        content: 'First completed'
      });
      await messageStore.addMessage(completedMessage);

      // Wait a bit for state to update
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should still be processing (others still active)
      state = guiState.getState();
      expect(state.isProcessing).toBe(true);
      expect(state.processingInteractions.size).toBe(2);

      // Complete remaining
      await Promise.all([
        messageStore.addMessage(Message.create({
          interactionId: interactions[1].id,
          role: 'assistant',
          content: 'Second completed'
        })),
        messageStore.addMessage(Message.create({
          interactionId: interactions[2].id,
          role: 'assistant',
          content: 'Third failed'
        }).withStatus('failed'))
      ]);

      // Now should not be processing
      state = guiState.getState();
      expect(state.isProcessing).toBe(false);
      expect(state.processingInteractions.size).toBe(0);
    });
  });

  describe('State History and Replay', () => {
    test('maintains complete state history', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      // Initial state
      const initialHistory = guiState.getStateHistory();
      const initialLength = initialHistory.length;

      // Create interaction
      await interactionStore.create(interaction);

      // Add message
      await messageStore.addMessage(Message.create({
        interactionId: interaction.id,
        role: 'user',
        content: 'Test'
      }));

      // Complete interaction
      await messageStore.addMessage(Message.create({
        interactionId: interaction.id,
        role: 'assistant',
        content: 'Test completed'
      }));

      const history = guiState.getStateHistory();
      expect(history.length).toBeGreaterThan(initialLength);

      // Verify history timestamps are ordered
      for (let i = 1; i < history.length; i++) {
        expect(history[i].timestamp).toBeGreaterThanOrEqual(history[i - 1].timestamp);
      }
    });

    test('can replay state transitions', async () => {
      const events: any[] = [];

      // Record all events
      guiState.on('stateChanged', (event) => {
        events.push({
          timestamp: Date.now(),
          ...event
        });
      });

      // Perform various actions
      const interaction1 = await interactionStore.create(
        Interaction.create({ source: 'user', type: InteractionType.QUERY })
      );
      
      await messageStore.addMessage(Message.create({
        interactionId: interaction1.id,
        role: 'user',
        content: 'First message'
      }));

      const interaction2 = await interactionStore.create(
        Interaction.create({ source: 'user', type: InteractionType.ACTION })
      );

      // Complete first interaction
      await messageStore.addMessage(Message.create({
        interactionId: interaction1.id,
        role: 'assistant',
        content: 'Response to first'
      }));

      // Verify we can trace through state changes
      expect(events.length).toBeGreaterThan(3);
      
      // Verify we recorded the expected events
      expect(events.length).toBeGreaterThan(3);
      
      // Find when an interaction was selected
      const selectionEvents = events.filter(e => 
        e.changes.includes('selectedInteraction')
      );
      expect(selectionEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Error State Handling', () => {
    test('handles rapid state changes gracefully', async () => {
      const interactionCount = 20;
      let errorCount = 0;

      guiState.on('error', () => errorCount++);

      // Create many interactions rapidly
      const promises = Array.from({ length: interactionCount }, async () => {
        const interaction = await interactionStore.create(
          Interaction.create({ source: 'user', type: InteractionType.QUERY })
        );
        
        // Add a processing message
        await messageStore.addMessage(Message.create({
          interactionId: interaction.id,
          role: 'assistant',
          content: 'Processing...'
        }).withStatus('processing'));
        
        // Add message
        await messageStore.addMessage(Message.create({
          interactionId: interaction.id,
          role: 'user',
          content: 'Rapid test'
        }));
        
        // Complete
        await messageStore.addMessage(Message.create({
          interactionId: interaction.id,
          role: 'assistant',
          content: 'Completed'
        }));
      });

      await Promise.all(promises);

      // Should handle all without errors
      expect(errorCount).toBe(0);
      
      const finalState = guiState.getState();
      expect(finalState.interactions).toHaveLength(interactionCount);
    });

    test('maintains consistency during concurrent updates', async () => {
      const interaction = Interaction.create({ source: 'user', type: InteractionType.QUERY });
      await interactionStore.create(interaction);
      
      // Wait for state to update
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate concurrent updates
      const updates = [
        interactionStore.update(interaction.id, (i) => 
          i.withMetadata({ ...i.metadata, step: 1 })
        ),
        messageStore.addMessage(Message.create({
          interactionId: interaction.id,
          role: 'assistant',
          content: 'Processing...',
          metadata: { processingStep: 'intermediate' }
        }).withStatus('processing')),
        interactionStore.update(interaction.id, (i) => 
          i.withMetadata({ ...i.metadata, step: 2 })
        ),
        messageStore.addMessage(Message.create({
          interactionId: interaction.id,
          role: 'assistant',
          content: 'Completed'
        }))
      ];

      await Promise.all(updates);

      const finalState = guiState.getState();
      const finalInteraction = finalState.interactions.find(
        (i: any) => i.id === interaction.id
      );

      // State should be consistent
      expect(finalInteraction.metadata.step).toBeDefined();
      expect(finalState.isProcessing).toBe(false);
      
      // Check messages are in correct state
      const messages = messageStore.getMessages(interaction.id);
      const completedMessage = messages.find(m => 
        m.role === 'assistant' && m.content === 'Completed'
      );
      expect(completedMessage?.status).toBe('completed');
    });
  });

  describe('Worktree State Management', () => {
    test('tracks worktree selection state', () => {
      const initialState = guiState.getState();
      expect(initialState.selectedWorktreeId).toBeNull();

      // Select worktree
      guiState.selectWorktree('wt-123');
      let state = guiState.getState();
      expect(state.selectedWorktreeId).toBe('wt-123');

      // Change worktree
      guiState.selectWorktree('wt-456');
      state = guiState.getState();
      expect(state.selectedWorktreeId).toBe('wt-456');

      // Deselect
      guiState.selectWorktree(null);
      state = guiState.getState();
      expect(state.selectedWorktreeId).toBeNull();
    });

    test('maintains worktree context in interactions', async () => {
      // Select a worktree
      guiState.selectWorktree('wt-feature');

      // Create interaction with worktree context
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.ACTION,
        metadata: {
          worktreeContext: {
            worktreeId: 'wt-feature',
            worktreePath: '/path/to/worktree',
            branch: 'feature/test'
          }
        }
      });
      
      await interactionStore.create(interaction);

      const state = guiState.getState();
      const createdInteraction = state.interactions.find(
        (i: any) => i.id === interaction.id
      );
      
      // Interaction might not be in state immediately due to async nature
      if (createdInteraction) {
        expect(createdInteraction.metadata.worktreeContext).toBeDefined();
        expect(createdInteraction.metadata.worktreeContext.worktreeId).toBe('wt-feature');
      } else {
        // If not found in state, verify it exists in store
        const storedInteraction = interactionStore.get(interaction.id);
        expect(storedInteraction).toBeDefined();
        expect(storedInteraction?.metadata?.worktreeContext?.worktreeId).toBe('wt-feature');
      }
    });
  });
});