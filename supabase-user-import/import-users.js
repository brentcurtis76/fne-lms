// import-users.js
import fs from 'fs'
import csv from 'csv-parser'
import { createClient } from '@supabase/supabase-js'

// 1. Tell it where your project is and your secret key:
const supabaseAdmin = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',       // ← replace with your project URL
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI',                      // ← replace with the service_role key you copied
  {
    auth: { autoRefreshToken: false, persistSession: false }
  }
)

// 2. Read the CSV and for each row, call createUser
fs.createReadStream('users.csv')
  .pipe(csv())
  .on('data', async ({ email, password }) => {
    console.log('Creating user:', email)
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true   // marks them as “email already verified”
    })
    if (error) {
      console.error('❌ Error for', email, error.message)
    } else {
      console.log('✅ Created user ID', data.id)
    }
  })
  .on('end', () => {
    console.log('All done!')
  })