import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E'

const supabase = createClient(supabaseUrl, anonKey)

async function fetchInstructors() {
  const { data, error } = await supabase
    .from('instructors')
    .select('*')
    .order('full_name', { ascending: true })

  if (error) {
    console.error('❌ Error fetching instructors:', error.message)
    process.exit(1)
  }

  console.log('✅ Instructors fetched:', data)
}

fetchInstructors()
