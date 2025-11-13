/**
 * Clear all transformation assessments from production database
 * USE WITH CAUTION: This deletes ALL assessment data
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function clearTransformationAssessments() {
  console.log('🗑️  CLEARING TRANSFORMATION ASSESSMENTS');
  console.log('=====================================\n');

  // Step 1: Count existing assessments
  console.log('📊 Step 1: Counting existing assessments...');
  const { data: assessments, error: countError } = await supabase
    .from('transformation_assessments')
    .select('id, area, status, started_at, growth_community_id');

  if (countError) {
    console.error('❌ Error counting assessments:', countError);
    process.exit(1);
  }

  if (!assessments || assessments.length === 0) {
    console.log('✅ No assessments found - database is already clean!');
    process.exit(0);
  }

  console.log(`📋 Found ${assessments.length} assessments:\n`);

  // Show summary
  const byArea = {};
  const byStatus = {};

  assessments.forEach(a => {
    byArea[a.area] = (byArea[a.area] || 0) + 1;
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  });

  console.log('By Area:');
  Object.entries(byArea).forEach(([area, count]) => {
    console.log(`  - ${area}: ${count}`);
  });

  console.log('\nBy Status:');
  Object.entries(byStatus).forEach(([status, count]) => {
    console.log(`  - ${status}: ${count}`);
  });

  console.log('\nFirst 5 assessments:');
  assessments.slice(0, 5).forEach(a => {
    console.log(`  - ${a.id.slice(0, 8)}... (${a.area}, ${a.status}, ${new Date(a.started_at).toLocaleDateString()})`);
  });

  // Step 2: Ask for confirmation
  console.log('\n⚠️  WARNING: This will DELETE ALL transformation assessments!');
  console.log('This action CANNOT be undone.\n');

  // Check if running with --confirm flag
  const confirmed = process.argv.includes('--confirm');

  if (!confirmed) {
    console.log('❌ Deletion cancelled.');
    console.log('\nTo proceed with deletion, run:');
    console.log('  node scripts/clear-transformation-assessments.js --confirm\n');
    process.exit(0);
  }

  // Step 3: Delete all assessments
  console.log('\n🗑️  Step 2: Deleting all assessments...');
  const { error: deleteError } = await supabase
    .from('transformation_assessments')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (dummy condition)

  if (deleteError) {
    console.error('❌ Error deleting assessments:', deleteError);
    process.exit(1);
  }

  console.log(`✅ Deleted ${assessments.length} assessments successfully!`);

  // Step 4: Verify deletion
  console.log('\n🔍 Step 3: Verifying deletion...');
  const { data: remaining, error: verifyError } = await supabase
    .from('transformation_assessments')
    .select('id');

  if (verifyError) {
    console.error('❌ Error verifying deletion:', verifyError);
    process.exit(1);
  }

  if (remaining && remaining.length > 0) {
    console.warn(`⚠️  Warning: ${remaining.length} assessments still remain!`);
    process.exit(1);
  }

  console.log('✅ Verification complete - all assessments deleted!');
  console.log('\n🎉 Database is now clean and ready for production assessments.\n');
}

// Run the script
clearTransformationAssessments().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
