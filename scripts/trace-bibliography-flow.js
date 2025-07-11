import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Add a timestamp to track when data changes
let traceId = Date.now();

async function monitorBlock() {
  const blockId = '6e4962ec-2145-4492-be3f-4cceafc1b470';
  let lastPayload = null;
  
  console.log('🔍 Starting bibliography block monitor...');
  console.log('Block ID:', blockId);
  console.log('Check the browser console logs while testing\n');
  
  // Check every 2 seconds
  setInterval(async () => {
    const { data: block, error } = await supabase
      .from('blocks')
      .select('payload')
      .eq('id', blockId)
      .single();
      
    if (error) {
      console.error('Error fetching block:', error);
      return;
    }
    
    const currentPayload = JSON.stringify(block.payload);
    
    if (currentPayload !== lastPayload) {
      console.log('\n⚡ CHANGE DETECTED at', new Date().toISOString());
      
      // Find the PDF item
      const pdfItem = block.payload.items?.find(item => item.type === 'pdf' && item.title === 'prueba pdf');
      
      if (pdfItem) {
        console.log('PDF Item Status:');
        console.log('  - URL:', pdfItem.url || '❌ EMPTY');
        console.log('  - Filename:', pdfItem.filename || '❌ MISSING');
        console.log('  - Filesize:', pdfItem.filesize || '❌ MISSING');
        
        if (pdfItem.url && !pdfItem.filename) {
          console.log('\n🚨 CRITICAL: URL exists but filename/filesize missing!');
          console.log('This means the file uploaded but metadata was not saved.');
        }
      }
      
      console.log('\nFull payload:', JSON.stringify(block.payload, null, 2));
      lastPayload = currentPayload;
    }
  }, 2000);
  
  console.log('\nMonitoring... Press Ctrl+C to stop');
}

monitorBlock();