const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function listEquipoImages() {
  console.log('🔍 Listing all files in resources/Equipo folder...\n');
  
  try {
    const { data, error } = await supabase.storage
      .from('resources')
      .list('Equipo', {
        limit: 100,
        offset: 0
      });
    
    if (error) {
      console.error('❌ Error listing files:', error);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log('📁 No files found in Equipo folder');
      return;
    }
    
    console.log(`📁 Found ${data.length} files in Equipo folder:\n`);
    
    data.forEach((file, index) => {
      const baseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/';
      const encodedName = encodeURIComponent(file.name);
      const fullUrl = baseUrl + encodedName;
      
      console.log(`${index + 1}. ${file.name}`);
      console.log(`   📄 Type: ${file.metadata?.mimetype || 'unknown'}`);
      console.log(`   📏 Size: ${(file.metadata?.size / 1024).toFixed(1)} KB`);
      console.log(`   🔗 URL: ${fullUrl}`);
      console.log('');
    });
    
    // Focus on the specific people mentioned
    console.log('🎯 SPECIFIC SEARCHES:\n');
    
    const searches = ['Coral Regí', 'Pepe Menéndez', 'Elena Guillén', 'Brent Curtis'];
    
    searches.forEach(person => {
      const found = data.find(file => 
        file.name.toLowerCase().includes(person.toLowerCase()) ||
        file.name.toLowerCase().includes(person.toLowerCase().replace(' ', '%20'))
      );
      
      if (found) {
        const baseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/';
        const encodedName = encodeURIComponent(found.name);
        const fullUrl = baseUrl + encodedName;
        console.log(`✅ ${person}: ${found.name}`);
        console.log(`   🔗 ${fullUrl}`);
      } else {
        console.log(`❌ ${person}: NOT FOUND`);
      }
      console.log('');
    });
    
  } catch (err) {
    console.error('💥 Unexpected error:', err);
  }
}

listEquipoImages();