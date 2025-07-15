// Simple test to verify streaming token behavior
import { query } from '@anthropic-ai/claude-code';

async function testTokenStreaming() {
  console.log('Testing token streaming...');
  
  let tokenUpdates = 0;
  const updates: number[] = [];
  
  for await (const message of query({
    prompt: 'Say "hello world"',
    options: {
      maxTurns: 1,
    },
  })) {
    console.log('\nMessage type:', message.type);
    
    if (message.type === 'assistant' && message.message?.content) {
      // Extract text content
      let text = '';
      if (Array.isArray(message.message.content)) {
        text = message.message.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('');
      }
      
      if (text) {
        const tokens = Math.ceil(text.length / 4);
        updates.push(tokens);
        console.log('Content:', text);
        console.log('Estimated tokens:', tokens);
      }
    }
    
    if (message.type === 'result') {
      console.log('Final result:', message.result);
      if (message.usage) {
        console.log('Actual token usage:', message.usage);
      }
    }
  }
  
  console.log('\nToken updates:', updates);
}

testTokenStreaming().catch(console.error);