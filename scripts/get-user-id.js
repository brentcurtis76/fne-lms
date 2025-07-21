const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key for auth.users access
const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getUserId() {
  try {
    let page = 1;
    let found = false;
    
    while (!found) {
      // Use admin API to access auth.users with pagination
      const { data: adminData, error: adminError } = await supabase.auth.admin.listUsers({
        page: page,
        perPage: 100
      });
      
      if (adminError) {
        console.error('Error with admin API:', adminError);
        return;
      }
      
      console.log(`Searching page ${page}, found ${adminData.users.length} users`);
      
      const user = adminData.users.find(u => u.email === 'brent@perrotuertocm.cl');
      if (user) {
        console.log('\n✅ Found user:');
        console.log('User ID:', user.id);
        console.log('Email:', user.email);
        console.log('Created at:', user.created_at);
        console.log('\nCopy this ID for testing:', user.id);
        found = true;
      } else if (adminData.users.length < 100) {
        // No more pages to search
        console.log('\n❌ User not found in auth.users');
        console.log('Total pages searched:', page);
        break;
      } else {
        page++;
      }
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

getUserId();