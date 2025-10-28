const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://sxlogxqzmarhqsblxmtj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function fixTomCommunity() {
    const tomUserId = 'ca5efb9a-fac7-4741-b9b9-699694308ae8';

    console.log('=== FIXING TOM PETTY COMMUNITY ASSIGNMENT ===\n');

    // 1. Find Tom's active role
    const { data: activeRole } = await supabase
        .from('user_roles')
        .select('id, role_type, community_id, school_id, schools(name)')
        .eq('user_id', tomUserId)
        .eq('is_active', true)
        .single();

    if (!activeRole) {
        console.log('❌ No active role found for Tom');
        return;
    }

    console.log('Current active role:');
    console.log(`  Role: ${activeRole.role_type}`);
    console.log(`  School: ${activeRole.schools?.name}`);
    console.log(`  Community ID: ${activeRole.community_id}`);

    // 2. Remove community assignment (set to NULL)
    console.log('\nRemoving community assignment from active role...');
    const { error: updateError } = await supabase
        .from('user_roles')
        .update({ community_id: null })
        .eq('id', activeRole.id);

    if (updateError) {
        console.error('❌ Error updating role:', updateError);
        return;
    }

    console.log('✅ Community removed from active role');

    // 3. Clear user_roles_cache
    console.log('\nClearing user_roles_cache...');
    const { error: cacheError } = await supabase
        .from('user_roles_cache')
        .delete()
        .eq('user_id', tomUserId);

    if (cacheError) {
        console.error('❌ Error clearing cache:', cacheError);
    } else {
        console.log('✅ Cache cleared');
    }

    // 4. Verify
    console.log('\n=== VERIFICATION ===');
    const { data: updatedRole } = await supabase
        .from('user_roles')
        .select('role_type, community_id, school_id, schools(name)')
        .eq('user_id', tomUserId)
        .eq('is_active', true)
        .single();

    console.log('Updated active role:');
    console.log(`  Role: ${updatedRole.role_type}`);
    console.log(`  School: ${updatedRole.schools?.name}`);
    console.log(`  Community: ${updatedRole.community_id || 'None (✅ Correct!)'}`);

    const { data: cacheCheck } = await supabase
        .from('user_roles_cache')
        .select('*')
        .eq('user_id', tomUserId);

    console.log(`\nCache status: ${cacheCheck.length === 0 ? '✅ Empty (will rebuild on next login)' : `⚠️ ${cacheCheck.length} entries`}`);

    console.log('\n✅ Tom Petty is now:');
    console.log('   - Part of Liceo Nacional de Llolleo');
    console.log('   - NOT part of any growth community');
    console.log('   - Should disappear from Arnoldo Cisternas community on next page refresh');
}

fixTomCommunity().catch(console.error);
