const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function updateAnnaComas() {
  const { data, error } = await supabase
    .from('instructors')
    .update({ photo_url: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/instructor-photos/Anna_Comas.jpeg' })
    .eq('id', '4737789c-ac76-4e4a-8659-352e822b18eb')
    .select();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('✅ Anna Comas actualizada:');
  console.log('   Nombre:', data[0].full_name);
  console.log('   Foto:', data[0].photo_url);
}

updateAnnaComas();
