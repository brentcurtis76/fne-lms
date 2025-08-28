const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updatePrograms() {
  try {
    // First, delete all existing programs
    console.log('Deleting existing programs...');
    const { error: deleteError } = await supabase
      .from('pasantias_programs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (using impossible ID match)
    
    if (deleteError && deleteError.code !== 'PGRST116') {
      console.error('Error deleting programs:', deleteError);
      return;
    }
    
    // Insert the correct programs
    console.log('Inserting correct programs...');
    const programs = [
      {
        name: 'Programa para Líderes Pedagógicos',
        description: 'Pasantía internacional para líderes educativos con visitas a escuelas innovadoras, talleres especializados y certificación internacional. Precio regular: $2.500.000 CLP. Precio especial: $2.000.000 CLP si se paga antes del 30 de septiembre de 2025.',
        price: 2500000,
        pdf_url: 'https://heyzine.com/flip-book/9723a41fa1.html',
        display_order: 1,
        is_active: true
      },
      {
        name: 'Programa Estratégico para Directivos',
        description: 'Experiencia intensiva de liderazgo educativo y gestión del cambio para equipos directivos. Precio regular: $2.500.000 CLP. Precio especial: $2.000.000 CLP si se paga antes del 30 de septiembre de 2025.',
        price: 2500000,
        pdf_url: 'https://heyzine.com/flip-book/562763b1bb.html',
        display_order: 2,
        is_active: true
      }
    ];
    
    const { data, error: insertError } = await supabase
      .from('pasantias_programs')
      .insert(programs)
      .select();
    
    if (insertError) {
      console.error('Error inserting programs:', insertError);
      return;
    }
    
    console.log('✅ Programs updated successfully!');
    console.log('Programs in database:', data);
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

updatePrograms();