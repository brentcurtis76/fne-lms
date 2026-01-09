import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E'

const supabase = createClient(supabaseUrl, anonKey)

// 👇 Replace this with any real instructor ID from your list
const instructorId = '3c4dc67e-89fa-4b34-841a-1f821f58aa52'

async function fetchInstructorById() {
  const { data, error } = await supabase
    .from('instructors')
    .select('*')
    .eq('id', instructorId)
    .single()

  if (error) {
    console.error('❌ Error fetching instructor:', error.message)
    process.exit(1)
  }

  console.log('✅ Instructor found:', data)
}

fetchInstructorById()
