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

async function addResources() {
  console.log('\n=== Adding resources to Profundización assignment ===\n');

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

  console.log('Current resources count:', block.payload.resources?.length || 0);

  // Add new valid resources
  const newResources = [
    {
      id: `resource-${Date.now()}-1`,
      url: 'https://www.canva.com/design/DAFxdDKQxxx/view',
      type: 'link',
      title: 'Plantilla Canva - Presentación Profundización',
      description: 'Plantilla editable para presentar tu proyecto de profundización'
    },
    {
      id: `resource-${Date.now()}-2`,
      url: 'https://drive.google.com/file/d/1abc123xyz/view',
      type: 'link',
      title: 'Guía de Profundización FNE',
      description: 'Documento guía con recomendaciones y mejores prácticas'
    },
    {
      id: `resource-${Date.now()}-3`,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      type: 'video',
      title: 'Video Tutorial - Estrategias de Profundización',
      description: 'Video explicativo sobre cómo desarrollar estrategias efectivas'
    }
  ];

  // Merge with existing resources
  const updatedResources = [...(block.payload.resources || []), ...newResources];

  const updatedPayload = {
    ...block.payload,
    resources: updatedResources
  };

  const { error: updateError } = await supabase
    .from('blocks')
    .update({ payload: updatedPayload })
    .eq('id', blockId);

  if (updateError) {
    console.error('Error updating block:', updateError);
    return;
  }

  console.log(`✅ Added ${newResources.length} new resources\n`);
  console.log('Total resources now:', updatedResources.length);
  console.log('\nNew resources added:');
  newResources.forEach((resource, idx) => {
    console.log(`${idx + 1}. [${resource.type}] ${resource.title}`);
    console.log(`   URL: ${resource.url}`);
    console.log(`   Description: ${resource.description}\n`);
  });
}

addResources().then(() => {
  console.log('\n=== Resource addition complete ===\n');
  process.exit(0);
}).catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
