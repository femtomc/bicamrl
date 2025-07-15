import { test, expect, describe, beforeEach } from "bun:test";
import { WakeAgent } from "../../src/agents/wake";
import { InteractionBus } from "../../src/interaction/bus";
import { LLMService, MockLLMProvider } from "../../src/llm/service";
import { Interaction, InteractionType } from "../../src/interaction/types";
import { waitFor } from "../test-setup";

describe("Wake Agent", () => {
  let wakeAgent: WakeAgent;
  let interactionBus: InteractionBus;
  let llmService: LLMService;
  
  beforeEach(() => {
    llmService = new LLMService("mock");
    llmService.registerProvider("mock", new MockLLMProvider());
    
    interactionBus = new InteractionBus();
    wakeAgent = new WakeAgent(interactionBus, llmService);
  });

  test("should process user queries", async () => {
    let processedInteraction: Interaction | null = null;
    
    // Listen for processing events
    interactionBus.subscribe((event) => {
      if (event.type === 'interaction_processing') {
        processedInteraction = { id: event.data.interactionId } as Interaction;
      }
    });
    
    // Start the agent in background (don't await it)
    wakeAgent.run().catch(() => {}); // Ignore errors from infinite loop
    
    // Give agent time to start
    await waitFor(100);
    
    // Post a user query
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Hello, Wake agent!'
    });
    
    await interactionBus.post(interaction);
    
    // Wait for processing
    await waitFor(1000);
    
    expect(processedInteraction).toBeDefined();
    expect(processedInteraction!.id).toBe(interaction.id);
  });

  test("should only process interactions from users", async () => {
    const processedIds: string[] = [];
    
    interactionBus.subscribe((event) => {
      if (event.type === 'interaction_processing') {
        processedIds.push(event.data.interactionId);
      }
    });
    
    // Start agent in background (don't await it)
    wakeAgent.run().catch(() => {}); // Ignore errors from infinite loop
    await waitFor(100);
    
    // Post system interaction (should be ignored)
    const systemInteraction = Interaction.create({
      source: 'system',
      type: InteractionType.OBSERVATION,
      initialMessage: 'System observation'
    });
    
    // Post user interaction (should be processed)
    const userInteraction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'User query'
    });
    
    await interactionBus.post(systemInteraction);
    await interactionBus.post(userInteraction);
    
    await waitFor(1000);
    
    // Only user interaction should be processed
    expect(processedIds).toHaveLength(1);
    expect(processedIds[0]).toBe(userInteraction.id);
  });

  test("should handle queries without tools", async () => {
    // Get the existing mock provider and set response
    const mockProvider = llmService.getProvider("mock") as MockLLMProvider;
    mockProvider.setResponse({
      content: "I'll help you with that."
    });
    
    // Start agent
    wakeAgent.run().catch(() => {}); // Ignore errors from infinite loop
    await waitFor(100);
    
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'Help me with something'
    });
    
    await interactionBus.post(interaction);
    await waitFor(1500);
    
    // Check interaction was processed
    const stats = await interactionBus.getQueueStats();
    expect(stats.completed).toBe(1);
  });

  test("should handle errors gracefully", async () => {
    // Mock LLM to throw error
    const mockProvider = new MockLLMProvider();
    mockProvider.setError(new Error("LLM service unavailable"));
    llmService.registerProvider("mock", mockProvider);
    
    let errorInteraction: any = null;
    interactionBus.subscribe((event) => {
      if (event.type === 'interaction_completed' && event.data.result?.error) {
        errorInteraction = event.data;
      }
    });
    
    // Start agent
    wakeAgent.run().catch(() => {}); // Ignore errors from infinite loop
    await waitFor(100);
    
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'This will fail'
    });
    
    await interactionBus.post(interaction);
    await waitFor(1000);
    
    expect(errorInteraction).toBeDefined();
    expect(errorInteraction.result.error).toContain("LLM service unavailable");
  });

  test("should build conversation context", async () => {
    const mockProvider = new MockLLMProvider();
    let capturedConversation: any[] = [];
    
    mockProvider.setResponseFunction((messages) => {
      capturedConversation = messages;
      return { content: "Response based on context" };
    });
    llmService.registerProvider("mock", mockProvider);
    
    // Start agent
    wakeAgent.run().catch(() => {}); // Ignore errors from infinite loop
    await waitFor(100);
    
    // Create interaction with conversation history
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.QUERY,
      initialMessage: 'My name is Alice'
    }).withMessage({
      role: 'assistant',
      content: 'Nice to meet you, Alice!',
      timestamp: new Date()
    }).withMessage({
      role: 'user',
      content: 'What is my name?',
      timestamp: new Date()
    });
    
    await interactionBus.post(interaction);
    await waitFor(1000);
    
    // Verify conversation context was passed to LLM
    expect(capturedConversation).toHaveLength(3);
    expect(capturedConversation[0].content).toBe('My name is Alice');
    expect(capturedConversation[2].content).toBe('What is my name?');
  });

  test("should process ACTION type interactions", async () => {
    let processedAction = false;
    
    interactionBus.subscribe((event) => {
      if (event.type === 'interaction_processing' && 
          event.data.type === InteractionType.ACTION) {
        processedAction = true;
      }
    });
    
    // Start agent
    wakeAgent.run().catch(() => {}); // Ignore errors from infinite loop
    await waitFor(100);
    
    const interaction = Interaction.create({
      source: 'user',
      type: InteractionType.ACTION,
      initialMessage: 'Create a new file'
    });
    
    await interactionBus.post(interaction);
    await waitFor(1000);
    
    expect(processedAction).toBe(true);
  });

  test("should not process when no interactions available", async () => {
    let loopCount = 0;
    
    // Override popForWork to count calls
    const originalPop = interactionBus.popForWork.bind(interactionBus);
    interactionBus.popForWork = async (...args) => {
      loopCount++;
      return originalPop(...args);
    };
    
    // Run agent for a short time
    wakeAgent.run().catch(() => {}); // Ignore errors from infinite loop
    await waitFor(100);
    await waitFor(3500); // Should loop ~3 times with 1s wait
    
    // Verify it's polling but not processing
    expect(loopCount).toBeGreaterThanOrEqual(3);
    expect(loopCount).toBeLessThan(10); // Not spinning wildly
  });
});