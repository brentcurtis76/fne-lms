const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixResources() {
  console.log('\n=== Fixing broken resources in block d935bebd-ed1f-4860-ae83-e367357f636c ===\n');

  const blockId = 'd935bebd-ed1f-4860-ae83-e367357f636c';

  // Get current block
  const { data: block, error: blockError } = await supabase
    .from('blocks')
    .select('payload')
    .eq('id', blockId)
    .single();

  if (blockError) {
    console.error('Error fetching block:', blockError);
    return;
  }

  console.log('Current resources:', JSON.stringify(block.payload.resources, null, 2));

  // Filter out broken resources:
  // 1. Resources with empty URLs
  // 2. Resources with example.com URLs
  const validResources = block.payload.resources.filter(resource => {
    const hasValidUrl = resource.url && resource.url.trim() !== '' && !resource.url.includes('example.com');
    if (!hasValidUrl) {
      console.log(`Removing broken resource: ${resource.title} (${resource.url || 'empty URL'})`);
    }
    return hasValidUrl;
  });

  console.log(`\nFiltered from ${block.payload.resources.length} to ${validResources.length} resources\n`);

  // Update block with cleaned resources
  const updatedPayload = {
    ...block.payload,
    resources: validResources
  };

  const { error: updateError } = await supabase
    .from('blocks')
    .update({ payload: updatedPayload })
    .eq('id', blockId);

  if (updateError) {
    console.error('Error updating block:', updateError);
    return;
  }

  console.log('✅ Resources cleaned successfully\n');
  console.log('Remaining resources:', JSON.stringify(validResources, null, 2));
}

fixResources().then(() => {
  console.log('\n=== Fix complete ===\n');
  process.exit(0);
}).catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
