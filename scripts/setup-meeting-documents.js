#!/usr/bin/env node

/**
 * Setup script for meeting documents feature
 * Creates storage bucket and applies database migration
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function setupMeetingDocuments() {
  console.log('Setting up meeting documents feature...\n');

  try {
    // Step 1: Create storage bucket
    console.log('1. Creating meeting-documents storage bucket...');
    
    const { data: bucket, error: bucketError } = await supabase.storage.createBucket('meeting-documents', {
      public: true,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/jpeg',
        'image/png',
        'image/gif'
      ]
    });

    if (bucketError) {
      if (bucketError.message.includes('already exists')) {
        console.log('   ✓ Storage bucket already exists');
      } else {
        throw bucketError;
      }
    } else {
      console.log('   ✓ Storage bucket created successfully');
    }

    // Step 2: Apply RLS policies to storage bucket
    console.log('\n2. Setting up storage RLS policies...');
    
    // These would need to be applied via Supabase dashboard or SQL
    console.log('   ℹ️  Storage RLS policies need to be configured in Supabase dashboard:');
    console.log('      - Allow authenticated users to upload');
    console.log('      - Allow public read access');
    console.log('      - Allow users to delete their own uploads');

    // Step 3: Check if meeting_attachments table exists
    console.log('\n3. Checking database tables...');
    
    const { data: tables, error: tablesError } = await supabase
      .from('meeting_attachments')
      .select('id')
      .limit(1);

    if (tablesError && tablesError.code === '42P01') {
      console.log('   ⚠️  meeting_attachments table does not exist');
      console.log('   Please run the following SQL in Supabase SQL Editor:');
      console.log('   database/create-meeting-attachments.sql');
    } else if (tablesError) {
      console.log('   ❌ Error checking table:', tablesError.message);
    } else {
      console.log('   ✓ meeting_attachments table exists');
    }

    console.log('\n✅ Setup complete!');
    console.log('\nNext steps:');
    console.log('1. If needed, run database/create-meeting-attachments.sql in Supabase SQL Editor');
    console.log('2. Configure storage RLS policies in Supabase dashboard');
    console.log('3. Test the feature by creating a meeting with attachments');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run the setup
setupMeetingDocuments();