#!/usr/bin/env bun

/**
 * Test multi-message conversation with Wake
 */

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3456';

async function testConversation() {
  console.log('Testing Wake conversation flow...');
  console.log('Server URL:', SERVER_URL);
  
  try {
    // 1. Start conversation
    console.log('\n1. Starting conversation...');
    const response1 = await fetch(`${SERVER_URL}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello! My name is Alice.' })
    });
    
    const result1 = await response1.json();
    const interactionId = result1.id;
    console.log('Created interaction:', interactionId);
    
    // Wait for first response
    await waitForResponse(interactionId, 1);
    
    // 2. Send follow-up message
    console.log('\n2. Sending follow-up message...');
    const response2 = await fetch(`${SERVER_URL}/message`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content: 'What is my name?',
        interactionId // Continue same conversation
      })
    });
    
    const result2 = await response2.json();
    console.log('Continued interaction:', result2.id === interactionId ? 'YES' : 'NO');
    
    // Wait for second response
    await waitForResponse(interactionId, 2);
    
    // 3. Check final conversation
    console.log('\n3. Final conversation:');
    const finalResponse = await fetch(`${SERVER_URL}/interactions/${interactionId}`);
    const interaction = await finalResponse.json();
    
    console.log('Total messages:', interaction.content?.length);
    interaction.content?.forEach((msg: any, i: number) => {
      console.log(`[${i+1}] ${msg.role}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
    });
    
    // Check if Wake remembered the name
    const lastMessage = interaction.content?.[interaction.content.length - 1];
    const rememberedName = lastMessage?.content?.toLowerCase().includes('alice');
    console.log('\n✓ Wake remembered the name:', rememberedName ? 'YES' : 'NO');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

async function waitForResponse(interactionId: string, expectedMessages: number) {
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    const response = await fetch(`${SERVER_URL}/interactions/${interactionId}`);
    const interaction = await response.json();
    
    const assistantMessages = interaction.content?.filter((m: any) => m.role === 'assistant').length || 0;
    console.log(`  Waiting... messages: ${interaction.content?.length}, assistant: ${assistantMessages}`);
    
    if (assistantMessages >= expectedMessages) {
      console.log('  Response received!');
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  throw new Error('Timeout waiting for response');
}

// Run the test
testConversation();