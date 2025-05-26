import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E'

const supabase = createClient(supabaseUrl, anonKey)

async function checkUserRole() {
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error) {
    console.error('❌ Failed to fetch user:', error.message)
    return
  }

  const role = user?.user_metadata?.role
  console.log('👤 Logged-in user:', user?.email)
  console.log('🛡️  User role:', role || 'not set')
}

checkUserRole()
