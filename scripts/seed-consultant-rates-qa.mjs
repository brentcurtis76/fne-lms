/**
 * seed-consultant-rates-qa.mjs
 *
 * Seeds consultant_rates data for QA testing of Phase 4.
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/seed-consultant-rates-qa.mjs
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('Starting QA seed for consultant_rates...\n');

  // Step 1: Fetch users with consultor role only
  const { data: consultantRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('user_id, role_types!inner(name)')
    .eq('role_types.name', 'consultor')
    .eq('is_active', true)
    .limit(5);

  if (rolesError || !consultantRoles || consultantRoles.length === 0) {
    console.error('No users with consultor role found:', rolesError?.message);
    process.exit(1);
  }

  const consultantIds = consultantRoles.map(r => r.user_id);

  const { data: consultants, error: profilesError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email')
    .in('id', consultantIds);

  if (profilesError || !consultants || consultants.length === 0) {
    console.error('No consultant profiles found:', profilesError?.message);
    process.exit(1);
  }

  // Step 2: Fetch hour types
  const { data: hourTypes, error: htError } = await supabase
    .from('hour_types')
    .select('id, key, display_name')
    .eq('is_active', true)
    .order('sort_order');

  if (htError || !hourTypes || hourTypes.length === 0) {
    console.error('No hour types found:', htError?.message);
    process.exit(1);
  }

  console.log(`Found ${consultants.length} consultants and ${hourTypes.length} hour types.`);
  console.log('Hour types:', hourTypes.map((ht) => ht.key).join(', '));

  // Step 3: Find an admin user as created_by
  const { data: adminRoles } = await supabase
    .from('user_roles')
    .select('user_id, role_types!inner(name)')
    .eq('role_types.name', 'admin')
    .eq('is_active', true)
    .limit(1);

  const adminId = adminRoles?.[0]?.user_id ?? consultants[0].id;

  // Step 4: Create sample rates for first 2 consultants
  const ratesToSeed = [];

  const consultant1 = consultants[0];
  const consultant2 = consultants.length > 1 ? consultants[1] : consultant1;

  // Consultant 1: rates for multiple hour types
  const ht1 = hourTypes.find((ht) => ht.key === 'asesoria_tecnica_online') ?? hourTypes[0];
  const ht2 = hourTypes.find((ht) => ht.key === 'asesoria_tecnica_presencial') ?? hourTypes[1 % hourTypes.length];
  const ht3 = hourTypes.find((ht) => ht.key === 'gestion_cambio_online') ?? hourTypes[2 % hourTypes.length];

  if (ht1) {
    ratesToSeed.push({
      consultant_id: consultant1.id,
      hour_type_id: ht1.id,
      rate_eur: 45.00,
      effective_from: '2025-01-01',
      effective_to: '2025-12-31',
      created_by: adminId,
    });
    ratesToSeed.push({
      consultant_id: consultant1.id,
      hour_type_id: ht1.id,
      rate_eur: 50.00,
      effective_from: '2026-01-01',
      effective_to: null, // Currently active
      created_by: adminId,
    });
  }

  if (ht2) {
    ratesToSeed.push({
      consultant_id: consultant1.id,
      hour_type_id: ht2.id,
      rate_eur: 55.00,
      effective_from: '2026-01-01',
      effective_to: null,
      created_by: adminId,
    });
  }

  // Consultant 2: different rates
  if (ht1 && consultant2.id !== consultant1.id) {
    ratesToSeed.push({
      consultant_id: consultant2.id,
      hour_type_id: ht1.id,
      rate_eur: 40.00,
      effective_from: '2026-01-01',
      effective_to: null,
      created_by: adminId,
    });
  }

  if (ht3 && consultant2.id !== consultant1.id) {
    ratesToSeed.push({
      consultant_id: consultant2.id,
      hour_type_id: ht3.id,
      rate_eur: 42.50,
      effective_from: '2026-01-01',
      effective_to: null,
      created_by: adminId,
    });
  }

  console.log(`\nAttempting to seed ${ratesToSeed.length} consultant rate records...`);

  // Insert rates using ON CONFLICT DO NOTHING to be idempotent
  let successCount = 0;
  let skipCount = 0;

  for (const rate of ratesToSeed) {
    const { data, error } = await supabase
      .from('consultant_rates')
      .insert(rate)
      .select('id, consultant_id, rate_eur, effective_from, effective_to')
      .single();

    if (error) {
      // Exclusion constraint or other conflict — skip
      if (error.code === '23P01' || error.code === '23505') {
        console.log(
          `  SKIP: Rate for consultant ${rate.consultant_id.slice(0, 8)}... already exists (overlap).`
        );
        skipCount++;
      } else {
        console.error(`  ERROR: ${error.message}`);
      }
    } else {
      console.log(
        `  OK: Rate €${rate.rate_eur}/h from ${rate.effective_from} to ${rate.effective_to ?? 'indefinido'} (id: ${data.id.slice(0, 8)}...)`
      );
      successCount++;
    }
  }

  // Step 5: Also seed a sample FX rate if none exists
  const { data: existingFx } = await supabase
    .from('fx_rates')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (!existingFx) {
    console.log('\nSeeding sample FX rate (EUR → CLP)...');
    const { error: fxError } = await supabase.from('fx_rates').insert({
      from_currency: 'EUR',
      to_currency: 'CLP',
      rate: 1050.75,
      fetched_at: new Date().toISOString(),
      source: 'qa_seed',
    });

    if (fxError) {
      console.error(`  ERROR seeding FX rate: ${fxError.message}`);
    } else {
      console.log('  OK: FX rate seeded (1 EUR = 1050.75 CLP)');
    }
  } else {
    console.log('\nFX rate already exists — skipping.');
  }

  console.log('\n========================================');
  console.log(`Seed complete: ${successCount} inserted, ${skipCount} skipped.`);
  console.log(`Consultants seeded: ${consultant1.id.slice(0, 8)}...${consultant2.id !== consultant1.id ? `, ${consultant2.id.slice(0, 8)}...` : ''}`);
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
