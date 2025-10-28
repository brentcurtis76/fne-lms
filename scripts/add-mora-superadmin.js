const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI',
  { auth: { persistSession: false } }
);

async function addMoraAsSuperadmin() {
  const userId = 'e4216c21-083c-40b5-9b98-ca81cba11b66';
  const brentUserId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';

  // Check if already a superadmin
  const { data: existing } = await supabase
    .from('superadmins')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    console.log('✓ Mora del Fresno is already a superadmin');
    console.log('Status:', existing.is_active ? 'Active' : 'Inactive');

    // Update to active if inactive
    if (!existing.is_active) {
      const { error: updateError } = await supabase
        .from('superadmins')
        .update({
          is_active: true,
          reason: 'Reactivated by Brent Curtis - ' + new Date().toISOString()
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Error reactivating:', updateError);
        process.exit(1);
      }
      console.log('✓ Reactivated superadmin status');
    }
  } else {
    // Insert new superadmin
    const { data, error } = await supabase
      .from('superadmins')
      .insert({
        user_id: userId,
        granted_by: brentUserId,
        is_active: true,
        reason: 'FNE staff with full platform control - Added by Brent Curtis'
      })
      .select();

    if (error) {
      console.error('Error adding superadmin:', error);
      process.exit(1);
    }

    console.log('✓ Successfully added Mora del Fresno as superadmin');
    console.log('User ID:', userId);
    console.log('Email: mdelfresno@nuevaeducacion.org');
    console.log('Name: Mora del Fresno');
  }

  // Verify - list all superadmins
  const { data: allSuperadmins } = await supabase
    .from('superadmins')
    .select(`
      *,
      profile:profiles!user_id(email, first_name, last_name)
    `)
    .eq('is_active', true)
    .order('created_at');

  console.log('\n=== Current Active Superadmins ===');
  allSuperadmins.forEach(sa => {
    const name = `${sa.profile?.first_name || ''} ${sa.profile?.last_name || ''}`.trim();
    console.log(`- ${name} (${sa.profile?.email})`);
  });
}

addMoraAsSuperadmin().catch(console.error);
