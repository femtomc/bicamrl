import { describe, test, expect, beforeEach } from 'bun:test';
import { InteractionStore } from '../store';
import { Interaction, InteractionType } from '../types';
import type { InteractionEvent } from '../store';

describe('InteractionStore', () => {
  let store: InteractionStore;
  let emittedEvents: InteractionEvent[] = [];

  beforeEach(() => {
    store = new InteractionStore();
    emittedEvents = [];
    
    // Capture emitted events
    store.subscribe((event) => {
      emittedEvents.push(event);
    });
  });

  describe('create', () => {
    test('creates interaction with provided data', async () => {
      const interaction = Interaction.create({
        source: 'user',
        type: InteractionType.QUERY,
        metadata: {
          title: 'Test Query'
        }
      });

      const id = await store.create(interaction);

      expect(id).toBe(interaction.id);
      expect(interaction.id).toBeDefined();
      expect(interaction.source).toBe('user');
      expect(interaction.type).toBe(InteractionType.QUERY);
      expect(interaction.metadata.title).toBe('Test Query');
      expect(interaction.createdAt).toBeInstanceOf(Date);
    });

    test('emits interaction:created event', () => {
      const interaction = store.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('interaction:created');
      expect(emittedEvents[0].data.interaction).toEqual(interaction);
    });

    test('creates interaction with worktree context', () => {
      const interaction = store.create({
        source: 'user',
        type: InteractionType.ACTION,
        metadata: {
          worktreeContext: {
            worktreeId: 'wt-123',
            worktreePath: '/path/to/worktree',
            branch: 'feature/test'
          }
        }
      });

      expect(interaction.metadata.worktreeContext).toBeDefined();
      expect(interaction.metadata.worktreeContext?.worktreeId).toBe('wt-123');
      expect(interaction.metadata.worktreeContext?.branch).toBe('feature/test');
    });
  });

  describe('get', () => {
    test('retrieves existing interaction', () => {
      const created = store.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      const retrieved = store.get(created.id);
      expect(retrieved).toEqual(created);
    });

    test('returns undefined for non-existent interaction', () => {
      const retrieved = store.get('non-existent-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAll', () => {
    test('returns all interactions', () => {
      const interaction1 = store.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      const interaction2 = store.create({
        source: 'system',
        type: InteractionType.OBSERVATION
      });

      const all = store.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContainEqual(interaction1);
      expect(all).toContainEqual(interaction2);
    });

    test('returns empty array when no interactions', () => {
      const all = store.getAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('update', () => {
    test('updates existing interaction', () => {
      const interaction = store.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      const updated = store.update(interaction.id, {
        metadata: {
          title: 'Updated Title'
        }
      });

      expect(updated?.metadata.title).toBe('Updated Title');
      expect(updated?.source).toBe('user'); // Unchanged
    });

    test('emits interaction:updated event', () => {
      const interaction = store.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      emittedEvents = []; // Clear creation event

      store.update(interaction.id, {
        metadata: { title: 'Updated' }
      });

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('interaction:updated');
      expect(emittedEvents[0].data.interaction.metadata.title).toBe('Updated');
    });

    test('returns undefined for non-existent interaction', () => {
      const updated = store.update('non-existent', {
        metadata: { title: 'Test' }
      });

      expect(updated).toBeUndefined();
    });

    test('merges metadata correctly', () => {
      const interaction = store.create({
        source: 'user',
        type: InteractionType.QUERY,
        metadata: {
          title: 'Original',
          tags: ['tag1']
        }
      });

      const updated = store.update(interaction.id, {
        metadata: {
          tags: ['tag2', 'tag3'],
          wakeProcessId: 'process-123'
        }
      });

      expect(updated?.metadata.title).toBe('Original'); // Preserved
      expect(updated?.metadata.tags).toEqual(['tag2', 'tag3']); // Replaced
      expect(updated?.metadata.wakeProcessId).toBe('process-123'); // Added
    });
  });

  describe('updateMetadata', () => {
    test('updates only metadata fields', async () => {
      const interaction = store.create({
        source: 'user',
        type: InteractionType.QUERY,
        metadata: {
          title: 'Original',
          tags: ['tag1']
        }
      });

      await store.updateMetadata(interaction.id, {
        title: 'Updated Title',
        wakeProcessId: 'wake-123'
      });

      const updated = store.get(interaction.id);
      expect(updated?.metadata.title).toBe('Updated Title');
      expect(updated?.metadata.tags).toEqual(['tag1']); // Preserved
      expect(updated?.metadata.wakeProcessId).toBe('wake-123');
    });

    test('handles processing state updates', async () => {
      const interaction = store.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      // Start processing
      await store.updateMetadata(interaction.id, {
        currentAction: 'Thinking...',
        processor: 'wake-agent',
        startedAt: new Date()
      });

      let updated = store.get(interaction.id);
      expect(updated?.metadata.currentAction).toBe('Thinking...');
      expect(updated?.metadata.processor).toBe('wake-agent');
      expect(updated?.metadata.startedAt).toBeInstanceOf(Date);

      // Clear processing state
      await store.updateMetadata(interaction.id, {
        currentAction: null,
        processor: null,
        startedAt: null
      });

      updated = store.get(interaction.id);
      expect(updated?.metadata.currentAction).toBeNull();
      expect(updated?.metadata.processor).toBeNull();
      expect(updated?.metadata.startedAt).toBeNull();
    });
  });

  describe('event subscription', () => {
    test('supports multiple subscribers', () => {
      const events1: InteractionEvent[] = [];
      const events2: InteractionEvent[] = [];

      const unsub1 = store.subscribe((event) => events1.push(event));
      const unsub2 = store.subscribe((event) => events2.push(event));

      store.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
      expect(events1[0]).toEqual(events2[0]);

      unsub1();
      unsub2();
    });

    test('unsubscribe stops receiving events', () => {
      const events: InteractionEvent[] = [];
      const unsubscribe = store.subscribe((event) => events.push(event));

      store.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      expect(events).toHaveLength(1);

      unsubscribe();

      store.create({
        source: 'user',
        type: InteractionType.QUERY
      });

      expect(events).toHaveLength(1); // No new events
    });
  });

  describe('getByType', () => {
    test('filters interactions by type', () => {
      store.create({ source: 'user', type: InteractionType.QUERY });
      store.create({ source: 'user', type: InteractionType.ACTION });
      store.create({ source: 'system', type: InteractionType.OBSERVATION });
      store.create({ source: 'user', type: InteractionType.QUERY });

      const queries = store.getByType(InteractionType.QUERY);
      const actions = store.getByType(InteractionType.ACTION);
      const observations = store.getByType(InteractionType.OBSERVATION);

      expect(queries).toHaveLength(2);
      expect(actions).toHaveLength(1);
      expect(observations).toHaveLength(1);
    });
  });

  describe('getBySource', () => {
    test('filters interactions by source', () => {
      store.create({ source: 'user', type: InteractionType.QUERY });
      store.create({ source: 'system', type: InteractionType.OBSERVATION });
      store.create({ source: 'wake-agent', type: InteractionType.ACTION });
      store.create({ source: 'user', type: InteractionType.ACTION });

      const userInteractions = store.getBySource('user');
      const systemInteractions = store.getBySource('system');
      const wakeInteractions = store.getBySource('wake-agent');

      expect(userInteractions).toHaveLength(2);
      expect(systemInteractions).toHaveLength(1);
      expect(wakeInteractions).toHaveLength(1);
    });
  });
});