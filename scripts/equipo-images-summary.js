const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getEquipoImages() {
  try {
    console.log('🎯 FNE LMS EQUIPO PROFILE PICTURES\n');
    console.log('='.repeat(50));
    
    // Get all files from the Equipo folder
    const { data: equipoFiles, error } = await supabase.storage
      .from('resources')
      .list('Equipo', {
        limit: 100,
        offset: 0
      });
    
    if (error) {
      console.error('Error accessing Equipo folder:', error);
      return;
    }
    
    if (!equipoFiles || equipoFiles.length === 0) {
      console.log('No files found in Equipo folder');
      return;
    }
    
    console.log(`Found ${equipoFiles.length} profile pictures:\n`);
    
    // Generate public URLs for each image
    const imageData = equipoFiles.map(file => {
      const { data: publicUrl } = supabase.storage
        .from('resources')
        .getPublicUrl(`Equipo/${file.name}`);
      
      return {
        name: file.name,
        size: file.metadata?.size || 'unknown',
        url: publicUrl.publicUrl,
        fileName: file.name.split('.')[0], // Name without extension
        extension: file.name.split('.').pop().toLowerCase()
      };
    });
    
    // Sort by name for easier reference
    imageData.sort((a, b) => a.fileName.localeCompare(b.fileName));
    
    // Display formatted results
    imageData.forEach((image, index) => {
      console.log(`${index + 1}. ${image.fileName}`);
      console.log(`   File: ${image.name}`);
      console.log(`   Size: ${image.size} bytes`);
      console.log(`   URL:  ${image.url}`);
      console.log('');
    });
    
    // Generate JavaScript object for easy copy-paste
    console.log('\n' + '='.repeat(50));
    console.log('📋 JAVASCRIPT OBJECT FOR COPY-PASTE:\n');
    
    const jsObject = imageData.reduce((acc, image) => {
      const key = image.fileName.toLowerCase().replace(/\s+/g, '_');
      acc[key] = image.url;
      return acc;
    }, {});
    
    console.log('const equipoImages = {');
    Object.entries(jsObject).forEach(([key, url], index, arr) => {
      const comma = index === arr.length - 1 ? '' : ',';
      console.log(`  ${key}: "${url}"${comma}`);
    });
    console.log('};');
    
    // Generate React component snippet
    console.log('\n' + '='.repeat(50));
    console.log('⚛️  REACT COMPONENT SNIPPET:\n');
    
    console.log('const teamMembers = [');
    imageData.forEach((image, index, arr) => {
      const comma = index === arr.length - 1 ? '' : ',';
      console.log(`  {`);
      console.log(`    name: "${image.fileName}",`);
      console.log(`    image: "${image.url}",`);
      console.log(`    role: "Role to be added",`);
      console.log(`    bio: "Bio to be added"`);
      console.log(`  }${comma}`);
    });
    console.log('];');
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

getEquipoImages();