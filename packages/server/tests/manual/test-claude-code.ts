#!/usr/bin/env bun

/**
 * Manual test to debug Claude Code integration
 * Run this while the server is already running
 */

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3456';

async function testClaudeCode() {
  console.log('Testing Claude Code integration...');
  console.log('Server URL:', SERVER_URL);
  
  try {
    // Send a test message
    console.log('\n1. Sending message...');
    const response = await fetch(`${SERVER_URL}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello, what is 2 + 2?' })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Response:', result);
    const interactionId = result.id;
    
    // Poll for completion
    console.log('\n2. Waiting for Wake to process...');
    let interaction: any;
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      const checkResponse = await fetch(`${SERVER_URL}/interactions/${interactionId}`);
      interaction = await checkResponse.json();
      
      console.log(`Attempt ${attempts + 1}: state=${interaction.state?.kind}, messages=${interaction.content?.length}`);
      
      if (interaction.state?.kind === 'completed' || interaction.state?.kind === 'failed') {
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    // Show final result
    console.log('\n3. Final interaction state:');
    console.log('State:', interaction.state);
    console.log('Messages:', interaction.content?.map((m: any) => ({
      role: m.role,
      content: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : '')
    })));
    
    const assistantMessage = interaction.content?.find((m: any) => m.role === 'assistant');
    if (assistantMessage) {
      console.log('\n4. Assistant response:');
      console.log(assistantMessage.content);
    } else {
      console.log('\n4. No assistant response found!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testClaudeCode();