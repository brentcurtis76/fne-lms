import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkBibliographyBlock() {
  const lessonId = 'b68bafd4-b81d-4150-a2cb-c31a8491483b';
  
  console.log('🔍 Checking bibliography block for lesson:', lessonId);
  
  // Get the bibliography block
  const { data: blocks, error } = await supabase
    .from('blocks')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('type', 'bibliography')
    .single();
    
  if (error) {
    console.error('Error fetching block:', error);
    return;
  }
  
  console.log('\n📚 Bibliography Block Found:');
  console.log('ID:', blocks.id);
  console.log('Position:', blocks.position);
  console.log('\n📄 Full Payload:');
  console.log(JSON.stringify(blocks.payload, null, 2));
  
  if (blocks.payload && blocks.payload.items) {
    console.log('\n📎 Bibliography Items:');
    blocks.payload.items.forEach((item, index) => {
      console.log(`\n--- Item ${index + 1} ---`);
      console.log('Type:', item.type);
      console.log('Title:', item.title);
      console.log('URL:', item.url);
      console.log('Filename:', item.filename || '❌ NO FILENAME');
      console.log('Filesize:', item.filesize || '❌ NO FILESIZE');
      console.log('Author:', item.author);
      console.log('Year:', item.year);
    });
  }
}

checkBibliographyBlock();