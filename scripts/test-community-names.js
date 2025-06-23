const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function testCommunityNames() {
  console.log('Testing community name fetching with separate queries...\n');

  // First get all communities
  const { data: communities, error } = await supabase
    .from('growth_communities')
    .select(`
      id,
      name,
      school:schools(name),
      generation:generations(name)
    `)
    .order('name');

  if (error) {
    console.error('Error fetching communities:', error);
    return;
  }

  // Then get workspace info separately
  const { data: workspaces, error: wsError } = await supabase
    .from('community_workspaces')
    .select('community_id, id, custom_name');

  if (wsError) {
    console.error('Error fetching workspaces:', wsError);
  }

  // Create a map of community_id to workspace info
  const workspaceMap = new Map();
  workspaces?.forEach(ws => {
    workspaceMap.set(ws.community_id, {
      workspace_id: ws.id,
      custom_name: ws.custom_name
    });
  });

  console.log('Found', communities.length, 'communities');
  console.log('Found', workspaces?.length || 0, 'workspaces\n');

  // Display communities with custom names
  communities.forEach(community => {
    const workspaceInfo = workspaceMap.get(community.id);
    
    console.log('Community:', community.name);
    console.log('Custom Name:', workspaceInfo?.custom_name || '(none)');
    console.log('Display Name:', workspaceInfo?.custom_name || community.name);
    console.log('Workspace ID:', workspaceInfo?.workspace_id || '(none)');
    console.log('---');
  });

  // Find the specific community
  const arnoldoCommunity = communities.find(c => c.name.includes('Arnoldo'));
  if (arnoldoCommunity) {
    const workspaceInfo = workspaceMap.get(arnoldoCommunity.id);
    console.log('\nSpecific community check:');
    console.log('Original name:', arnoldoCommunity.name);
    console.log('Custom name:', workspaceInfo?.custom_name);
    console.log('Should display as:', workspaceInfo?.custom_name || arnoldoCommunity.name);
  }
}

testCommunityNames().catch(console.error);