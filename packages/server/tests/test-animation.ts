// Test the new animation format
async function testAnimation() {
  const updates: string[] = [];
  
  // Send a message
  const sendResponse = await fetch('http://localhost:3456/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'Count to 3'
    })
  });
  
  const { id } = await sendResponse.json();
  console.log('Tracking interaction:', id);
  
  // Poll for updates
  const startTime = Date.now();
  const maxDuration = 10000;
  let lastAction = '';
  
  while (Date.now() - startTime < maxDuration) {
    const response = await fetch('http://localhost:3456/interactions');
    const interactions = await response.json();
    
    const interaction = interactions.find((i: any) => i.id === id);
    if (interaction) {
      if (interaction.metadata?.currentAction && interaction.metadata.currentAction !== lastAction) {
        lastAction = interaction.metadata.currentAction;
        updates.push(lastAction);
        console.log(`[${Date.now() - startTime}ms] ${lastAction}`);
      }
      
      if (interaction.status === 'completed') {
        console.log('\nCompleted!');
        console.log('Response:', interaction.content[interaction.content.length - 1]?.content);
        break;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  console.log('\nAnimation sequence:');
  updates.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
}

testAnimation().catch(console.error);