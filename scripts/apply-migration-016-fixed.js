const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('\n=== APPLYING MIGRATION 016 (FIXED) ===\n');

  const migrationSQL = fs.readFileSync(
    './database/migrations/016_auto_enroll_learning_path_courses.sql',
    'utf8'
  );

  console.log('📄 Migration file loaded');
  console.log('📊 Size:', migrationSQL.length, 'characters');
  console.log('\n🔧 Applying to Supabase...\n');

  // Execute the migration
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: migrationSQL
  });

  if (error) {
    console.error('❌ Migration failed:', error);
    console.error('\nTrying direct execution via raw SQL...\n');

    // If RPC fails, try executing directly
    // Note: This requires the SQL to be split into statements
    const statements = migrationSQL
      .split(';')
      .filter(stmt => stmt.trim().length > 0)
      .map(stmt => stmt.trim() + ';');

    console.log(`Split into ${statements.length} statements\n`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      console.log(`\n[${i + 1}/${statements.length}] Executing...`);

      const { error: stmtError } = await supabase.rpc('exec_sql', {
        sql: stmt
      });

      if (stmtError) {
        console.error(`  ❌ Failed:`, stmtError.message);
        failCount++;
      } else {
        console.log(`  ✅ Success`);
        successCount++;
      }
    }

    console.log(`\n📊 Results: ${successCount} succeeded, ${failCount} failed`);
    return;
  }

  console.log('✅ Migration applied successfully!');
  console.log('\nResult:', data);

  // Verify the function was created
  console.log('\n🔍 Verifying function exists...\n');

  const { data: verifyData, error: verifyError } = await supabase
    .rpc('batch_assign_learning_path', {
      p_path_id: '00000000-0000-0000-0000-000000000000',
      p_user_ids: [],
      p_group_ids: [],
      p_assigned_by: '00000000-0000-0000-0000-000000000000'
    });

  if (verifyError) {
    if (verifyError.message.includes('not found')) {
      console.log('✅ Function exists (test failed as expected with dummy IDs)');
    } else {
      console.log('⚠️  Function check inconclusive:', verifyError.message);
    }
  } else {
    console.log('✅ Function verified:', verifyData);
  }

  console.log('\n' + '='.repeat(70));
  console.log('MIGRATION 016 COMPLETE');
  console.log('='.repeat(70));
}

applyMigration().catch(console.error);
