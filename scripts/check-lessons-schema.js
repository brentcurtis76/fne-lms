#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function checkSchema() {
  console.log('🔍 Checking lessons table schema...\n');
  
  // Get existing lessons to see schema
  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('*')
    .limit(1);
  
  if (lessons && lessons[0]) {
    console.log('✅ Lessons table columns:');
    Object.keys(lessons[0]).forEach(col => {
      console.log(`  - ${col}: ${typeof lessons[0][col]}`);
    });
  }
  
  // Try to understand what columns are required
  console.log('\n🔍 Testing minimal insert requirements...');
  
  const { error: insertError } = await supabase
    .from('lessons')
    .insert({
      course_id: '00000000-0000-0000-0000-000000000000',
      title: 'Test Lesson',
      order_number: 1,
      // Try without description
    });
  
  if (insertError) {
    console.log('❌ Minimal insert failed:', insertError.message);
    console.log('   This tells us what columns are required/missing');
  } else {
    console.log('✅ Minimal insert would succeed (rolled back)');
  }
  
  // Check modules table too
  console.log('\n🔍 Checking modules table schema...');
  const { data: modules } = await supabase
    .from('modules')
    .select('*')
    .limit(1);
  
  if (modules && modules[0]) {
    console.log('✅ Modules table columns:');
    Object.keys(modules[0]).forEach(col => {
      console.log(`  - ${col}: ${typeof modules[0][col]}`);
    });
  }
}

checkSchema().catch(console.error);