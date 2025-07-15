#!/usr/bin/env bun

// Test script to demonstrate tool usage with permission prompts

async function testTools() {
  console.log('\n🛠️  Testing Tool System with Permissions\n');
  
  // Send a message that will trigger tool use
  const response = await fetch('http://localhost:3456/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'Please list the files in the current directory'
    })
  });
  
  const { id } = await response.json();
  console.log('📤 Sent message, tracking interaction:', id);
  
  // Monitor for tool permission requests
  const eventSource = new EventSource('http://localhost:3456/stream');
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'tool_permission_request') {
      console.log('\n🔐 Tool Permission Request:');
      console.log(`   Tool: ${data.data.toolName}`);
      console.log(`   Description: ${data.data.description}`);
      console.log(`   Arguments:`, data.data.arguments);
      console.log('\n   [Currently auto-approving in development mode]');
    }
    
    if (data.type === 'interaction_updated') {
      if (data.data.metadata?.currentAction?.includes('Executing tool')) {
        console.log(`\n⚙️  ${data.data.metadata.currentAction}`);
      }
    }
    
    if (data.type === 'interaction_completed' && data.data.interactionId === id) {
      console.log('\n✅ Interaction completed!');
      eventSource.close();
      process.exit(0);
    }
  };
  
  // Timeout after 30 seconds
  setTimeout(() => {
    console.log('\n⏱️  Test timed out');
    eventSource.close();
    process.exit(1);
  }, 30000);
}

// Check if tools are enabled
if (process.env.ENABLE_TOOLS !== 'true') {
  console.log('\n⚠️  Tools are not enabled!');
  console.log('   Run with: ENABLE_TOOLS=true bun run tests/test-tools.ts\n');
  process.exit(1);
}

testTools().catch(console.error);