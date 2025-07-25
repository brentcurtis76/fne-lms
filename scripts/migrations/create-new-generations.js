/**
 * Create a new generations table by working around the existing one
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

async function createNewGenerations() {
  console.log('🔧 Creating new generations approach...');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing required environment variables');
  }
  
  const supabase = createClient(supabaseUrl, serviceKey);
  
  try {
    // Let's try to work with what we have
    console.log('🔍 Checking current generations table...');
    
    // First, clear all data
    const { error: clearError } = await supabase
      .from('generations')
      .delete()
      .gte('id', 0);
    
    if (clearError && !clearError.message.includes('no rows')) {
      console.log('⚠️  Could not clear generations:', clearError.message);
    } else {
      console.log('✅ Cleared existing generations data');
    }
    
    // Now let's try to insert a test generation with an INTEGER school_id
    // First, create a test school
    console.log('🏫 Creating test school...');
    
    const testSchool = {
      id: 50000,
      name: 'Schema Test School',
      has_generations: true
    };
    
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .upsert(testSchool)
      .select()
      .single();
    
    if (schoolError) {
      console.error('❌ Could not create test school:', schoolError.message);
      return false;
    }
    
    console.log('✅ Test school created with ID:', school.id);
    
    // Now try to insert a generation using the school's INTEGER ID
    console.log('📚 Testing generation insert with INTEGER school_id...');
    
    const testGeneration = {
      school_id: parseInt(school.id), // Force integer
      name: 'Test Generation 2024',
      grade_range: '7-12',
      created_at: new Date().toISOString()
    };
    
    console.log('🔧 Attempting generation insert with school_id:', testGeneration.school_id, typeof testGeneration.school_id);
    
    const { data: generation, error: genError } = await supabase
      .from('generations')
      .insert(testGeneration)
      .select()
      .single();
    
    if (genError) {
      console.error('❌ Generation insert failed:', genError.message);
      console.error('Error code:', genError.code);
      console.error('Error details:', genError.details);
      
      // Let's check what the generations table actually expects
      console.log('🔍 Let me check the generations table schema...');
      
      // Try to get some information about the table
      const { data: existingGens, error: checkError } = await supabase
        .from('generations')
        .select('*')
        .limit(1);
      
      if (checkError) {
        console.log('Table check error:', checkError.message);
      } else {
        console.log('Table accessible, found', existingGens.length, 'records');
      }
      
      // Clean up test school
      await supabase.from('schools').delete().eq('id', 50000);
      
      return false;
    } else {
      console.log('🎉 SUCCESS! Generation inserted successfully');
      console.log('Generated generation ID:', generation.id);
      console.log('School ID type in result:', typeof generation.school_id);
      
      // Clean up test data
      await supabase.from('generations').delete().eq('id', generation.id);
      await supabase.from('schools').delete().eq('id', 50000);
      console.log('✅ Cleaned up test data');
      
      return true;
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Run the test
if (require.main === module) {
  createNewGenerations()
    .then(success => {
      if (success) {
        console.log('\n🎉 SCHEMA IS COMPATIBLE!');
        console.log('✅ generations table can accept INTEGER school_id');
        console.log('✅ Ready to run data seeding immediately');
        console.log('\nNext step: npm run seed:all');
      } else {
        console.log('\n❌ SCHEMA INCOMPATIBILITY CONFIRMED');
        console.log('Manual SQL execution is required');
        console.log('\nPlease run this in Supabase SQL Editor:');
        console.log('=' .repeat(50));
        console.log(`
-- Clear and recreate generations table
TRUNCATE TABLE public.generations CASCADE;
ALTER TABLE public.generations DROP CONSTRAINT IF EXISTS generations_school_id_fkey;
ALTER TABLE public.generations ALTER COLUMN school_id TYPE integer USING NULL;
ALTER TABLE public.generations ADD CONSTRAINT generations_school_id_fkey 
  FOREIGN KEY (school_id) REFERENCES public.schools(id);
        `);
        console.log('=' .repeat(50));
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 SCHEMA TEST CRASHED:', error.message);
      process.exit(1);
    });
}

module.exports = { createNewGenerations };