const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixLideresPdfUrl() {
  console.log('Fixing Programa para Líderes Pedagógicos PDF URL...\n');

  const correctUrl = 'https://heyzine.com/flip-book/fb8cf2cfb1.html';
  const programName = 'Programa para Líderes Pedagógicos';

  // First, check current URL
  const { data: currentProgram, error: fetchError } = await supabase
    .from('pasantias_programs')
    .select('name, pdf_url')
    .eq('name', programName)
    .single();

  if (fetchError) {
    console.error('Error fetching program:', fetchError);
    return;
  }

  console.log('Current state:');
  console.log(`  Program: ${currentProgram.name}`);
  console.log(`  Current URL: ${currentProgram.pdf_url}`);
  console.log(`  Correct URL: ${correctUrl}\n`);

  if (currentProgram.pdf_url === correctUrl) {
    console.log('✅ URL is already correct. No update needed.');
    return;
  }

  // Update the URL
  const { error: updateError } = await supabase
    .from('pasantias_programs')
    .update({
      pdf_url: correctUrl,
      updated_at: new Date().toISOString()
    })
    .eq('name', programName);

  if (updateError) {
    console.error('❌ Error updating program:', updateError);
    return;
  }

  console.log('✅ Successfully updated PDF URL!');

  // Verify the update
  const { data: updatedProgram } = await supabase
    .from('pasantias_programs')
    .select('name, pdf_url')
    .eq('name', programName)
    .single();

  console.log('\nVerification:');
  console.log(`  Program: ${updatedProgram.name}`);
  console.log(`  New URL: ${updatedProgram.pdf_url}`);
}

fixLideresPdfUrl()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
