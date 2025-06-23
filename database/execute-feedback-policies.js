const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

// Create Supabase client with service role
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function executeFeedbackPolicies() {
  try {
    console.log('🚀 Executing feedback screenshots storage policies...');
    
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'create-feedback-screenshots-policies.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('📄 SQL file loaded successfully');
    
    // Execute the entire SQL file at once
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: sqlContent
    });
    
    if (error) {
      console.error('❌ Error executing SQL:', error);
      throw error;
    }
    
    console.log('✅ SQL executed successfully');
    
    // Display the verification results
    if (data && Array.isArray(data)) {
      console.log('\n🔍 Verification Results:');
      console.log(`Found ${data.length} feedback storage policies:`);
      data.forEach(policy => {
        console.log(`  - ${policy.name} (${policy.operation}) for ${policy.roles}`);
      });
    } else {
      console.log('\n🔍 SQL executed but no verification data returned');
    }
    
    console.log('\n🎉 Feedback screenshots storage policies created successfully!');
    console.log('✅ This should fix the "Error al subir la imagen" issue');
    
  } catch (error) {
    console.error('💥 Error executing feedback policies:', error);
    process.exit(1);
  }
}

// Run the function
executeFeedbackPolicies();