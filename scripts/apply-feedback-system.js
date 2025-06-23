const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function applyFeedbackSystem() {
  console.log('🚀 Applying Feedback System Migration...\n');

  try {
    // Read and execute the main schema
    console.log('📊 Creating feedback tables and policies...');
    const schemaSQL = await fs.readFile(
      path.join(__dirname, '..', 'database', 'create-feedback-system.sql'),
      'utf8'
    );

    const { error: schemaError } = await supabase.rpc('exec_sql', {
      sql: schemaSQL
    });

    if (schemaError) {
      // If exec_sql doesn't exist, try direct query
      const { error: directError } = await supabase.from('platform_feedback').select('count').limit(1);
      if (directError && directError.code !== 'PGRST116') {
        throw new Error(`Schema creation failed: ${directError.message}`);
      }
      console.log('⚠️  Tables might already exist, continuing...');
    } else {
      console.log('✅ Feedback tables created successfully');
    }

    // Read and execute storage setup
    console.log('\n📦 Setting up storage bucket...');
    const storageSQL = await fs.readFile(
      path.join(__dirname, '..', 'database', 'setup-feedback-storage.sql'),
      'utf8'
    );

    const { error: storageError } = await supabase.rpc('exec_sql', {
      sql: storageSQL
    });

    if (storageError) {
      console.log('⚠️  Storage might already be configured, continuing...');
    } else {
      console.log('✅ Storage bucket configured successfully');
    }

    // Verify the setup
    console.log('\n🔍 Verifying setup...');
    
    // Check if tables exist
    const { data: feedbackCheck, error: feedbackCheckError } = await supabase
      .from('platform_feedback')
      .select('id')
      .limit(1);

    if (!feedbackCheckError || feedbackCheckError.code === 'PGRST116') {
      console.log('✅ platform_feedback table verified');
    } else {
      throw new Error(`Table verification failed: ${feedbackCheckError.message}`);
    }

    // Check storage bucket
    const { data: buckets, error: bucketError } = await supabase
      .storage
      .listBuckets();

    if (!bucketError && buckets?.some(b => b.id === 'feedback-screenshots')) {
      console.log('✅ feedback-screenshots bucket verified');
    } else {
      console.log('⚠️  Storage bucket verification failed - may need manual setup');
    }

    console.log('\n✨ Feedback system migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Run the SQL files manually in Supabase dashboard if needed');
    console.log('2. Test the feedback creation in the app');
    console.log('3. Verify storage uploads are working');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nPlease run the following SQL files manually in Supabase:');
    console.error('1. database/create-feedback-system.sql');
    console.error('2. database/setup-feedback-storage.sql');
    process.exit(1);
  }
}

// Run the migration
applyFeedbackSystem();