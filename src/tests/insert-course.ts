import { createClient } from '@supabase/supabase-js';

// Replace with your actual values
const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E';
const supabase = createClient(supabaseUrl, anonKey);

async function testInsertCourse() {
  const testCourse = {
    title: 'Curso de Prueba',
    description: 'Este curso es solo para pruebas unitarias.',
    instructor_id: '1d6e3e5d-93ed-4a95-96d4-1b9e7dc7891d', // Replace with valid instructor ID
    thumbnail_url: 'https://example.com/default-thumbnail.png',
    created_by: '6a4962f0-0d7b-45ce-838f-ead89c77b09d', // Replace with a valid admin user ID
  };

  const { data, error } = await supabase
    .from('courses')
    .insert([testCourse])
    .select()
    .single();

  if (error) {
    console.error('❌ Insert failed:', error.message);
    process.exit(1);
  } else {
    console.log('✅ Course inserted:', data);
    process.exit(0);
  }
}

testInsertCourse();