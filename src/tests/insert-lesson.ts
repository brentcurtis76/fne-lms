import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E'

const supabase = createClient(supabaseUrl, anonKey)

async function insertLesson() {
  const { data, error } = await supabase
    .from('lessons')
    .insert([
      {
        title: 'Lesson from Code',
        content: 'This lesson was inserted from a TypeScript script!'
      }
    ])
    .select('*') // 👈 force Supabase to return the inserted row

  if (error) {
    console.error('❌ Insert failed:', error.message)
    process.exit(1)
  } else {
    console.log('✅ Insert succeeded:', data)
    process.exit(0)
  }
}

insertLesson()