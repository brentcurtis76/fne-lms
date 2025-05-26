import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E'

const supabase = createClient(supabaseUrl, anonKey)

// Replace with the actual lesson ID you want to update
const lessonId = 'd5eeaf58-1f31-41e0-8ce3-957fed9cf4ed'

async function updateLesson() {
  const { data, error } = await supabase
    .from('lessons')
    .update({
      title: 'Updated Lesson Title',
      content: 'This lesson was updated from the script.'
    })
    .eq('id', lessonId)
    .select('*') // Return the updated row

  if (error) {
    console.error('❌ Update failed:', error.message)
    process.exit(1)
  } else {
    console.log('✅ Update succeeded:', data)
    process.exit(0)
  }
}

updateLesson()