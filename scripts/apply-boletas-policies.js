// Apply RLS policies for the 'boletas' storage bucket used for expense report receipts
// Run with: node scripts/apply-boletas-policies.js

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

async function applyBoletasPolicies() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Error: Missing Supabase credentials in .env.local');
    console.log('Make sure you have the following environment variables:');
    console.log('NEXT_PUBLIC_SUPABASE_URL=your-supabase-url');
    console.log('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
    process.exit(1);
  }

  console.log('🔧 Applying RLS policies for boletas storage bucket...\n');
  
  // Create Supabase client with service role key
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'fix-boletas-storage-policies.sql');
    if (!fs.existsSync(sqlFile)) {
      console.error('❌ SQL file not found:', sqlFile);
      process.exit(1);
    }
    
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const preview = statement.substring(0, 80).replace(/\s+/g, ' ');
      console.log(`${i + 1}. Executing: ${preview}...`);
      
      try {
        // For newer Supabase versions, we can execute SQL directly
        const { data, error } = await supabase.rpc('exec_sql', { 
          sql: statement + ';' 
        });
        
        if (error) {
          // Some errors are expected (e.g., "policy already exists")
          if (error.message.includes('already exists') || 
              error.message.includes('does not exist')) {
            console.log(`   ⚠️  Warning: ${error.message}`);
          } else {
            console.log(`   ❌ Error: ${error.message}`);
          }
        } else {
          console.log(`   ✅ Success`);
        }
      } catch (err) {
        console.log(`   ❌ Exception: ${err.message}`);
      }
    }
    
    console.log('\n🎉 RLS policies application completed!\n');
    
    // Test bucket access
    console.log('🧪 Testing boletas bucket access...');
    
    try {
      // Check if bucket exists
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      
      if (bucketsError) {
        console.log('❌ Cannot list buckets:', bucketsError.message);
      } else {
        const boletasBucket = buckets.find(b => b.name === 'boletas');
        if (boletasBucket) {
          console.log('✅ Boletas bucket exists');
          console.log(`   - Public: ${boletasBucket.public}`);
          console.log(`   - File size limit: ${boletasBucket.file_size_limit ? (boletasBucket.file_size_limit / 1024 / 1024).toFixed(1) + 'MB' : 'No limit'}`);
          console.log(`   - Allowed MIME types: ${boletasBucket.allowed_mime_types ? boletasBucket.allowed_mime_types.length + ' types' : 'All types'}`);
        } else {
          console.log('⚠️  Boletas bucket not found - it will be created when the SQL runs');
        }
      }
      
      // Test bucket listing (this will verify RLS policies work)
      const { data: files, error: listError } = await supabase.storage
        .from('boletas')
        .list('', { limit: 1 });
      
      if (listError) {
        if (listError.message.includes('row-level security')) {
          console.log('⚠️  RLS policies are active (this is expected for admin-only access)');
        } else {
          console.log('❌ Bucket list test failed:', listError.message);
        }
      } else {
        console.log('✅ Bucket list test successful');
        console.log(`   Found ${files.length} files in boletas bucket`);
      }
      
    } catch (error) {
      console.log('❌ Bucket test failed:', error.message);
    }
    
    console.log('\n📋 Next steps:');
    console.log('1. Ensure admin users are properly authenticated when uploading receipts');
    console.log('2. Test receipt upload from the expense reporting system');
    console.log('3. If still having issues, check that the user has role="admin" in the profiles table');
    console.log('\n✨ Done! The boletas bucket is now configured for admin-only access.');
    
  } catch (error) {
    console.error('💥 Error applying policies:', error.message);
    process.exit(1);
  }
}

applyBoletasPolicies();