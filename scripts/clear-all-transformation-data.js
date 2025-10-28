/**
 * Clear all transformation assessments and access records
 * This gives us a clean slate to test the new access control system
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function clearAllTransformationData() {
  console.log('🧹 Starting cleanup of all transformation data...\n');

  try {
    // 1. Delete all transformation conversation messages
    console.log('1️⃣  Deleting transformation conversation messages...');
    const { error: messagesError, count: messagesCount } = await supabase
      .from('transformation_conversation_messages')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (messagesError) {
      console.error('   ❌ Error:', messagesError.message);
    } else {
      console.log(`   ✅ Deleted ${messagesCount || 0} conversation messages`);
    }

    // 2. Delete all transformation results
    console.log('\n2️⃣  Deleting transformation results...');
    const { error: resultsError, count: resultsCount } = await supabase
      .from('transformation_results')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (resultsError) {
      console.error('   ❌ Error:', resultsError.message);
    } else {
      console.log(`   ✅ Deleted ${resultsCount || 0} results`);
    }

    // 3. Delete all transformation assessments
    console.log('\n3️⃣  Deleting transformation assessments...');
    const { error: assessmentsError, count: assessmentsCount } = await supabase
      .from('transformation_assessments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (assessmentsError) {
      console.error('   ❌ Error:', assessmentsError.message);
    } else {
      console.log(`   ✅ Deleted ${assessmentsCount || 0} assessments`);
    }

    // 4. Delete all access audit logs
    console.log('\n4️⃣  Deleting access audit logs...');
    const { error: auditError, count: auditCount } = await supabase
      .from('transformation_access_audit_log')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (auditError) {
      console.error('   ❌ Error:', auditError.message);
    } else {
      console.log(`   ✅ Deleted ${auditCount || 0} audit log entries`);
    }

    // 5. Delete all transformation access records
    console.log('\n5️⃣  Deleting transformation access records...');
    const { error: accessError, count: accessCount } = await supabase
      .from('growth_community_transformation_access')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (accessError) {
      console.error('   ❌ Error:', accessError.message);
    } else {
      console.log(`   ✅ Deleted ${accessCount || 0} access records`);
    }

    // 6. Reset transformation_enabled flags on all communities (optional, for clean slate)
    console.log('\n6️⃣  Resetting transformation_enabled flags...');
    const { error: flagError, count: flagCount } = await supabase
      .from('growth_communities')
      .update({ transformation_enabled: false })
      .eq('transformation_enabled', true);

    if (flagError) {
      console.error('   ❌ Error:', flagError.message);
    } else {
      console.log(`   ✅ Reset ${flagCount || 0} community flags`);
    }

    console.log('\n✅ CLEANUP COMPLETE!\n');
    console.log('📊 Summary:');
    console.log(`   - Conversation messages: ${messagesCount || 0}`);
    console.log(`   - Results: ${resultsCount || 0}`);
    console.log(`   - Assessments: ${assessmentsCount || 0}`);
    console.log(`   - Audit logs: ${auditCount || 0}`);
    console.log(`   - Access records: ${accessCount || 0}`);
    console.log(`   - Community flags reset: ${flagCount || 0}`);
    console.log('\n🎯 System is now in a clean state. Ready to test assignment flow!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

clearAllTransformationData();
