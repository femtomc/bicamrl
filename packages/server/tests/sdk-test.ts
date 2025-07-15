// Simple test to understand Claude Code SDK streaming behavior
import { query } from '@anthropic-ai/claude-code';

async function testStreaming() {
  console.log('Testing Claude Code SDK streaming...');
  
  const messages = [];
  let contentUpdates = 0;
  
  for await (const message of query({
    prompt: 'Count from 1 to 10',
    options: {
      maxTurns: 1,
    },
  })) {
    console.log('\n--- Message ---');
    console.log('Type:', message.type);
    
    if (message.type === 'assistant') {
      console.log('Assistant message:', message.message);
      if (message.message.content) {
        contentUpdates++;
        const content = typeof message.message.content === 'string' 
          ? message.message.content 
          : JSON.stringify(message.message.content);
        console.log('Content update #' + contentUpdates + ':', content.substring(0, 100) + '...');
      }
    } else if (message.type === 'result') {
      console.log('Result:', message.result?.substring(0, 100) + '...');
    }
    
    messages.push(message);
  }
  
  console.log('\nTotal messages:', messages.length);
  console.log('Content updates:', contentUpdates);
  
  // Print final result
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.result) {
    console.log('\nFinal result:', lastMessage.result);
  }
}

testStreaming().catch(console.error);