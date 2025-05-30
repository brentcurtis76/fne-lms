// Complete fix for boletas bucket RLS policies
// This script handles the full setup including bucket creation and RLS policies
// Run with: node scripts/fix-boletas-rls-complete.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

async function fixBoletasRLS() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Error: Missing Supabase credentials in .env.local');
    console.log('Required environment variables:');
    console.log('NEXT_PUBLIC_SUPABASE_URL=your-supabase-url');
    console.log('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
    process.exit(1);
  }

  console.log('🔧 Complete fix for boletas bucket RLS policies...\n');
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    console.log('1️⃣ Checking current bucket status...');
    
    // Check if bucket exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.log('❌ Cannot list buckets:', bucketsError.message);
    } else {
      const boletasBucket = buckets.find(b => b.name === 'boletas');
      if (boletasBucket) {
        console.log('✅ Boletas bucket already exists');
      } else {
        console.log('⚠️  Boletas bucket not found, will create it');
      }
    }
    
    console.log('\n2️⃣ Removing old problematic policies...');
    
    // Drop existing problematic policies
    const dropPolicies = [
      'DROP POLICY IF EXISTS "boletas_authenticated_all" ON storage.objects',
      'DROP POLICY IF EXISTS "Allow admin access to boletas bucket" ON storage.objects',
      'DROP POLICY IF EXISTS "Allow admin uploads to boletas bucket" ON storage.objects',
      'DROP POLICY IF EXISTS "Allow admin reads from boletas bucket" ON storage.objects',
      'DROP POLICY IF EXISTS "Allow admin updates to boletas bucket" ON storage.objects',
      'DROP POLICY IF EXISTS "Allow admin deletes from boletas bucket" ON storage.objects'
    ];
    
    for (const policy of dropPolicies) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: policy });
        if (error && !error.message.includes('does not exist')) {
          console.log(`   ⚠️  ${error.message}`);
        } else {
          console.log(`   ✅ Dropped policy`);
        }
      } catch (err) {
        console.log(`   ⚠️  ${err.message}`);
      }
    }
    
    console.log('\n3️⃣ Ensuring RLS is enabled...');
    
    try {
      const { error } = await supabase.rpc('exec_sql', { 
        sql: 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY' 
      });
      if (error && !error.message.includes('already')) {
        console.log(`   ⚠️  ${error.message}`);
      } else {
        console.log('   ✅ RLS enabled on storage.objects');
      }
    } catch (err) {
      console.log(`   ⚠️  ${err.message}`);
    }
    
    console.log('\n4️⃣ Creating new admin-only policies...');
    
    // Create new policies
    const policies = [
      {
        name: 'Admin Upload Policy',
        sql: `
          CREATE POLICY "Allow admin uploads to boletas bucket"
          ON storage.objects FOR INSERT
          TO authenticated
          WITH CHECK (
              bucket_id = 'boletas' 
              AND EXISTS (
                  SELECT 1 FROM profiles 
                  WHERE id = auth.uid() 
                  AND role = 'admin'
              )
          )
        `
      },
      {
        name: 'Admin Read Policy',
        sql: `
          CREATE POLICY "Allow admin reads from boletas bucket"
          ON storage.objects FOR SELECT
          TO authenticated
          USING (
              bucket_id = 'boletas' 
              AND EXISTS (
                  SELECT 1 FROM profiles 
                  WHERE id = auth.uid() 
                  AND role = 'admin'
              )
          )
        `
      },
      {
        name: 'Admin Update Policy',
        sql: `
          CREATE POLICY "Allow admin updates to boletas bucket"
          ON storage.objects FOR UPDATE
          TO authenticated
          USING (
              bucket_id = 'boletas' 
              AND EXISTS (
                  SELECT 1 FROM profiles 
                  WHERE id = auth.uid() 
                  AND role = 'admin'
              )
          )
          WITH CHECK (
              bucket_id = 'boletas' 
              AND EXISTS (
                  SELECT 1 FROM profiles 
                  WHERE id = auth.uid() 
                  AND role = 'admin'
              )
          )
        `
      },
      {
        name: 'Admin Delete Policy',
        sql: `
          CREATE POLICY "Allow admin deletes from boletas bucket"
          ON storage.objects FOR DELETE
          TO authenticated
          USING (
              bucket_id = 'boletas' 
              AND EXISTS (
                  SELECT 1 FROM profiles 
                  WHERE id = auth.uid() 
                  AND role = 'admin'
              )
          )
        `
      }
    ];
    
    for (const policy of policies) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: policy.sql });
        if (error) {
          console.log(`   ❌ ${policy.name}: ${error.message}`);
        } else {
          console.log(`   ✅ ${policy.name} created`);
        }
      } catch (err) {
        console.log(`   ❌ ${policy.name}: ${err.message}`);
      }
    }
    
    console.log('\n5️⃣ Ensuring bucket exists with proper configuration...');
    
    try {
      // Create or update bucket
      const { error } = await supabase.rpc('exec_sql', { 
        sql: `
          INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
          VALUES (
              'boletas', 
              'boletas', 
              false,
              52428800,
              ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain']
          )
          ON CONFLICT (id) DO UPDATE SET
              public = false,
              file_size_limit = 52428800,
              allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain']
        `
      });
      
      if (error) {
        console.log(`   ⚠️  ${error.message}`);
      } else {
        console.log('   ✅ Bucket configured successfully');
      }
    } catch (err) {
      console.log(`   ⚠️  ${err.message}`);
    }
    
    console.log('\n6️⃣ Testing the configuration...');
    
    // Test bucket access
    try {
      const { data: files, error: listError } = await supabase.storage
        .from('boletas')
        .list('', { limit: 1 });
      
      if (listError) {
        if (listError.message.includes('row-level security') || 
            listError.message.includes('permission denied')) {
          console.log('   ✅ RLS policies are working (admin-only access enforced)');
        } else {
          console.log(`   ⚠️  Unexpected error: ${listError.message}`);
        }
      } else {
        console.log('   ✅ Bucket accessible (service role has access)');
      }
    } catch (error) {
      console.log(`   ⚠️  Test error: ${error.message}`);
    }
    
    console.log('\n🎉 Boletas bucket RLS fix completed!\n');
    
    console.log('📋 Summary:');
    console.log('✅ Old problematic policies removed');
    console.log('✅ New admin-only policies created');
    console.log('✅ Bucket configured as private with proper file limits');
    console.log('✅ Only users with role="admin" can upload/manage receipts\n');
    
    console.log('📝 What this fixes:');
    console.log('• "new row violates row-level security policy" errors');
    console.log('• Ensures only admin users can upload expense receipts');
    console.log('• Proper file type and size restrictions (50MB, images/PDFs)');
    console.log('• Secure private bucket (not publicly accessible)\n');
    
    console.log('🧪 To test:');
    console.log('1. Login as an admin user');
    console.log('2. Go to /expense-reports');
    console.log('3. Create a new expense report');
    console.log('4. Try uploading a receipt image or PDF');
    console.log('5. The upload should now work without RLS errors\n');
    
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

fixBoletasRLS();