#!/usr/bin/env bun

/**
 * Debug interaction structure to see what GUI receives
 */

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3456';

async function debugInteractionStructure() {
  console.log('Creating test interaction...\n');
  
  // 1. Create interaction
  const createResp = await fetch(`${SERVER_URL}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Debug test message' })
  });
  
  if (!createResp.ok) {
    console.error('Failed to create interaction:', createResp.statusText);
    return;
  }
  
  const createData = await createResp.json();
  console.log('CREATE RESPONSE:');
  console.log(JSON.stringify(createData, null, 2));
  
  const id = createData.id;
  
  // 2. Wait a bit for processing
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 3. Get interaction
  const getResp = await fetch(`${SERVER_URL}/interactions/${id}`);
  if (!getResp.ok) {
    console.error('Failed to get interaction:', getResp.statusText);
    return;
  }
  
  const interaction = await getResp.json();
  console.log('\nINTERACTION STRUCTURE:');
  console.log(JSON.stringify(interaction, null, 2));
  
  // 4. List all interactions
  const listResp = await fetch(`${SERVER_URL}/interactions`);
  if (!listResp.ok) {
    console.error('Failed to list interactions:', listResp.statusText);
    return;
  }
  
  const interactions = await listResp.json();
  console.log('\nALL INTERACTIONS COUNT:', interactions.length);
  
  // Find our interaction
  const found = interactions.find((i: any) => i.id === id);
  console.log('FOUND IN LIST:', !!found);
  
  if (found) {
    console.log('\nINTERACTION FROM LIST:');
    console.log(JSON.stringify(found, null, 2));
  }
}

debugInteractionStructure().catch(console.error);