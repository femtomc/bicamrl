// Test streaming updates through the API
async function testStreaming() {
  const updates: any[] = [];
  
  // Send a message
  const sendResponse = await fetch('http://localhost:3456/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'Tell me a very short joke'
    })
  });
  
  const sendResult = await sendResponse.json();
  console.log('Send result:', sendResult);
  const interactionId = sendResult.interactionId || sendResult.id;
  console.log('Interaction ID:', interactionId);
  
  // Poll for updates
  const startTime = Date.now();
  const maxDuration = 30000; // 30 seconds max
  
  while (Date.now() - startTime < maxDuration) {
    const response = await fetch('http://localhost:3456/interactions');
    const interactions = await response.json();
    
    const interaction = interactions.find((i: any) => i.id === interactionId);
    if (interaction) {
      console.log(`[${Date.now() - startTime}ms] Status:`, interaction.status);
      
      if (interaction.metadata?.currentAction) {
        updates.push({
          time: Date.now() - startTime,
          action: interaction.metadata.currentAction,
          tokens: interaction.metadata.tokens
        });
        console.log('  Action:', interaction.metadata.currentAction);
        if (interaction.metadata.tokens) {
          console.log('  Tokens:', interaction.metadata.tokens);
        }
      }
      
      if (interaction.status === 'completed') {
        console.log('\nResponse received:', interaction.content[interaction.content.length - 1]?.content);
        break;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\nProgress updates summary:');
  updates.forEach(u => {
    console.log(`  ${u.time}ms: ${u.action}`);
  });
  
  // Verify we got some progress updates
  console.log('\nTotal updates:', updates.length);
  
  // Verify we saw different actions
  const actions = [...new Set(updates.map(u => u.action))];
  console.log('Unique actions:', actions);
}

testStreaming().catch(console.error);