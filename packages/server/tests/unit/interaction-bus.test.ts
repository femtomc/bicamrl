import { test, expect, describe, beforeEach } from "bun:test";
import { InteractionBus } from "../../src/interaction/bus";
import { Interaction, InteractionType } from "../../src/interaction/types";
import { waitFor } from "../test-setup";

describe("InteractionBus", () => {
  let bus: InteractionBus;
  
  beforeEach(() => {
    bus = new InteractionBus();
  });

  test("should post interactions to queue", async () => {
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Test query'
    });
    
    const id = await bus.post(interaction);
    
    expect(id).toBe(interaction.id);
    
    const stats = await bus.getQueueStats();
    expect(stats.queueSize).toBe(1);
  });

  test("should emit events when interactions are posted", async () => {
    let postedEvent: any = null;
    
    bus.subscribe((event) => {
      if (event.type === 'interaction_posted') {
        postedEvent = event;
      }
    });
    
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Test'
    });
    
    await bus.post(interaction);
    
    expect(postedEvent).toBeDefined();
    expect(postedEvent.data.interactionId).toBe(interaction.id);
    expect(postedEvent.data.status).toBe('queued');
  });

  test("should allow agents to pop work from queue", async () => {
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Test'
    });
    
    await bus.post(interaction);
    
    // Pop for work
    const work = await bus.popForWork('wake', undefined, [InteractionType.QUERY]);
    
    expect(work).toBeDefined();
    expect(work!.id).toBe(interaction.id);
    
    // Queue should be empty now
    const stats = await bus.getQueueStats();
    expect(stats.queueSize).toBe(0);
    expect(stats.processing).toBe(1);
  });

  test("should filter interactions by type", async () => {
    const query = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Query'
    });
    
    const action = Interaction.create({
      source: 'user',
      type: InteractionType.ACTION,
      initialMessage: 'Action'
    });
    
    await bus.post(query);
    await bus.post(action);
    
    // Pop only queries
    const work = await bus.popForWork('wake', undefined, [InteractionType.QUERY]);
    
    expect(work).toBeDefined();
    expect(work!.type).toBe(InteractionType.QUERY);
    
    // Action should still be in queue
    const stats = await bus.getQueueStats();
    expect(stats.queueSize).toBe(1);
  });

  test("should apply custom filter function", async () => {
    const interaction1 = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Test 1'
    }).withMetadata({ priority: 'high' });
    
    const interaction2 = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Test 2'
    }).withMetadata({ priority: 'low' });
    
    await bus.post(interaction1);
    await bus.post(interaction2);
    
    // Pop only high priority
    const work = await bus.popForWork(
      'wake',
      (i) => i.metadata?.priority === 'high'
    );
    
    expect(work).toBeDefined();
    expect(work!.metadata.priority).toBe('high');
  });

  test("should submit completed work", async () => {
    let completedEvent: any = null;
    
    bus.subscribe((event) => {
      if (event.type === 'interaction_completed') {
        completedEvent = event;
      }
    });
    
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Test'
    });
    
    await bus.post(interaction);
    const work = await bus.popForWork('wake');
    
    // Submit completed work
    await bus.submitWork(work!, 'wake', { response: 'Done' }, false);
    
    await waitFor(10);
    
    expect(completedEvent).toBeDefined();
    expect(completedEvent.data.result.response).toBe('Done');
    
    // Check stats
    const stats = await bus.getQueueStats();
    expect(stats.completed).toBe(1);
    expect(stats.queueSize).toBe(0);
    expect(stats.processing).toBe(0);
  });

  test("should re-queue interactions that need more work", async () => {
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Test'
    });
    
    await bus.post(interaction);
    const work = await bus.popForWork('wake');
    
    // Submit with needsMoreWork = true
    await bus.submitWork(work!, 'wake', { partial: 'result' }, true);
    
    // Should be back in queue
    const stats = await bus.getQueueStats();
    expect(stats.queueSize).toBe(1);
    expect(stats.processing).toBe(0);
    
    // Can pop again
    const work2 = await bus.popForWork('wake');
    expect(work2).toBeDefined();
    expect(work2!.id).toBe(interaction.id);
  });

  test("should track processing agent", async () => {
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Test'
    });
    
    await bus.post(interaction);
    
    // Agent 1 pops work
    const work1 = await bus.popForWork('agent1');
    expect(work1).toBeDefined();
    
    // Agent 2 tries to pop - should get nothing
    const work2 = await bus.popForWork('agent2');
    expect(work2).toBeNull();
    
    // After submission, others can process
    await bus.submitWork(work1!, 'agent1', { done: true }, false);
    
    const stats = await bus.getQueueStats();
    expect(stats.processing).toBe(0);
  });

  test("should handle concurrent access", async () => {
    const interactions = Array.from({ length: 10 }, (_, i) => 
      Interaction.create({
        source: 'user',
        type: InteractionType.QUERY,
        initialMessage: `Test ${i}`
      })
    );
    
    // Post all interactions
    await Promise.all(interactions.map(i => bus.post(i)));
    
    // Multiple agents pop concurrently
    const agents = ['agent1', 'agent2', 'agent3'];
    const results = await Promise.all(
      agents.map(agent => bus.popForWork(agent))
    );
    
    // Each agent should get different work
    const ids = results.filter(r => r !== null).map(r => r!.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("should unsubscribe from events", async () => {
    let callCount = 0;
    
    const unsubscribe = bus.subscribe((event) => {
      callCount++;
    });
    
    await bus.post(Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Test'
    }));
    
    expect(callCount).toBe(1);
    
    // Unsubscribe
    unsubscribe();
    
    await bus.post(new Interaction({
      source: 'user',
      type: InteractionType.QUERY,
      content: [{ role: 'user', content: 'Test 2', timestamp: new Date() }]
    }));
    
    // Count should not increase
    expect(callCount).toBe(1);
  });
});