import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testBibliographyUpdate() {
  const blockId = '6e4962ec-2145-4492-be3f-4cceafc1b470';
  
  console.log('🔍 Testing bibliography update...');
  
  // First, get the current block
  const { data: block, error: fetchError } = await supabase
    .from('blocks')
    .select('*')
    .eq('id', blockId)
    .single();
    
  if (fetchError) {
    console.error('Error fetching block:', fetchError);
    return;
  }
  
  console.log('\n📄 Current payload:');
  console.log(JSON.stringify(block.payload, null, 2));
  
  // Modify the payload to add filename/filesize to the PDF item
  const updatedPayload = {
    ...block.payload,
    items: block.payload.items.map(item => {
      if (item.id === 'jofbg0373' && item.type === 'pdf') {
        return {
          ...item,
          url: 'https://test-url.com/test.pdf',
          filename: 'test-document.pdf',
          filesize: 1048576 // 1MB
        };
      }
      return item;
    })
  };
  
  console.log('\n📝 Attempting to update with:');
  console.log(JSON.stringify(updatedPayload, null, 2));
  
  // Try to update the block
  const { data: updateResult, error: updateError } = await supabase
    .from('blocks')
    .update({ payload: updatedPayload })
    .eq('id', blockId)
    .select()
    .single();
    
  if (updateError) {
    console.error('\n❌ Update failed:', updateError);
    return;
  }
  
  console.log('\n✅ Update successful!');
  console.log('\n📥 Returned data:');
  console.log(JSON.stringify(updateResult.payload, null, 2));
  
  // Verify by fetching again
  const { data: verifyBlock, error: verifyError } = await supabase
    .from('blocks')
    .select('*')
    .eq('id', blockId)
    .single();
    
  if (verifyError) {
    console.error('\n❌ Verification fetch failed:', verifyError);
    return;
  }
  
  console.log('\n🔍 Verification - data in database:');
  console.log(JSON.stringify(verifyBlock.payload, null, 2));
  
  // Check if filename and filesize persisted
  const pdfItem = verifyBlock.payload.items.find(item => item.id === 'jofbg0373');
  if (pdfItem) {
    console.log('\n📊 PDF item analysis:');
    console.log('Has URL:', !!pdfItem.url);
    console.log('Has filename:', !!pdfItem.filename);
    console.log('Has filesize:', !!pdfItem.filesize);
    console.log('Filename value:', pdfItem.filename);
    console.log('Filesize value:', pdfItem.filesize);
  }
}

testBibliographyUpdate();