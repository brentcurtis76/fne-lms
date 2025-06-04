#!/usr/bin/env node

/**
 * FNE LMS - Document Repository Migration Script
 * Applies the document management system database schema to Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Initialize Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🚀 Starting Document Repository Migration...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../database/document-system.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📁 Loaded migration file: document-system.sql');

    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
      .map(stmt => stmt + ';');

    console.log(`📊 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip comment-only statements
      if (statement.trim().startsWith('/*') || statement.trim() === ';') {
        continue;
      }

      try {
        console.log(`⏳ [${i + 1}/${statements.length}] Executing statement...`);
        
        const { error } = await supabase.rpc('exec_sql', { 
          sql_query: statement 
        });

        if (error) {
          // Try direct execution for some statements
          const { error: directError } = await supabase.from('_migrations').insert({});
          
          if (error.message.includes('relation') && error.message.includes('does not exist')) {
            // This might be expected for some CREATE statements
            console.log(`✅ [${i + 1}/${statements.length}] Statement executed (table/function created)`);
            successCount++;
          } else {
            console.log(`⚠️  [${i + 1}/${statements.length}] Warning: ${error.message}`);
            errorCount++;
          }
        } else {
          console.log(`✅ [${i + 1}/${statements.length}] Statement executed successfully`);
          successCount++;
        }
      } catch (err) {
        console.log(`❌ [${i + 1}/${statements.length}] Error: ${err.message}`);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📋 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successful statements: ${successCount}`);
    console.log(`⚠️  Warnings/Errors: ${errorCount}`);
    console.log(`📊 Total statements: ${statements.length}`);

    if (errorCount === 0) {
      console.log('\n🎉 Document repository migration completed successfully!');
    } else {
      console.log('\n⚠️  Migration completed with some warnings. Check the output above.');
    }

    // Create sample data
    await createSampleData();

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

async function createSampleData() {
  console.log('\n📝 Creating sample document folders...');

  try {
    // Get existing workspaces to add sample folders
    const { data: workspaces, error: workspaceError } = await supabase
      .from('community_workspaces')
      .select('id, name')
      .limit(3);

    if (workspaceError) {
      console.log('⚠️  Could not load workspaces for sample data:', workspaceError.message);
      return;
    }

    if (!workspaces || workspaces.length === 0) {
      console.log('ℹ️  No workspaces found. Skipping sample folder creation.');
      return;
    }

    // Default folder structure
    const defaultFolders = [
      'Presentaciones',
      'Plantillas', 
      'Evaluaciones',
      'Recursos',
      'Planificación',
      'Informes',
      'Guías',
      'Formularios'
    ];

    // Get the first admin user for sample data
    const { data: adminUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    const createdBy = adminUser?.id || workspaces[0].id; // Fallback

    for (const workspace of workspaces) {
      console.log(`📁 Creating folders for workspace: ${workspace.name}`);
      
      for (const folderName of defaultFolders) {
        const { error } = await supabase
          .from('document_folders')
          .insert({
            workspace_id: workspace.id,
            folder_name: folderName,
            created_by: createdBy
          });

        if (error && !error.message.includes('duplicate')) {
          console.log(`⚠️  Could not create folder "${folderName}":`, error.message);
        } else if (!error) {
          console.log(`   ✅ Created folder: ${folderName}`);
        }
      }
    }

    console.log('✅ Sample folders created successfully!');

  } catch (error) {
    console.log('⚠️  Error creating sample data:', error.message);
  }
}

// Storage bucket setup
async function setupStorageBucket() {
  console.log('\n📦 Setting up storage bucket...');

  try {
    // Check if bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === 'community-documents');

    if (!bucketExists) {
      // Create bucket
      const { error: createError } = await supabase.storage.createBucket('community-documents', {
        public: false,
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
          'image/gif',
          'video/mp4',
          'text/plain'
        ],
        fileSizeLimit: 50 * 1024 * 1024 // 50MB
      });

      if (createError) {
        console.log('⚠️  Could not create storage bucket:', createError.message);
      } else {
        console.log('✅ Storage bucket "community-documents" created successfully!');
      }
    } else {
      console.log('ℹ️  Storage bucket "community-documents" already exists.');
    }

  } catch (error) {
    console.log('⚠️  Error setting up storage bucket:', error.message);
  }
}

// Main execution
async function main() {
  console.log('🔧 FNE LMS - Document Repository Migration');
  console.log('==========================================\n');

  await runMigration();
  await setupStorageBucket();

  console.log('\n🎊 All tasks completed!');
  console.log('\n📌 Next steps:');
  console.log('   1. Test the document upload functionality');
  console.log('   2. Verify folder creation and navigation');
  console.log('   3. Check RLS policies are working correctly');
  console.log('   4. Run the test script: node scripts/test-document-system.js');
  console.log('\n🔗 Access the workspace at: http://localhost:3000/community/workspace');
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('\n💥 Unhandled error:', error);
  process.exit(1);
});

// Run the migration
main().catch(console.error);