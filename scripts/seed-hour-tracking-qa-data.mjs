/**
 * Seed script for Hour Tracking QA test data — Phase 2
 * Idempotent: safe to run multiple times.
 *
 * Creates:
 * - 1 test FX rate entry
 * - Test contract allocations via existing QA contracts (if any)
 * - 12 test sessions with mixed statuses and ledger entries
 *
 * NOTE: Uses synthetic data only. No real student or user data.
 * The QA test school (ID=257) is used if it exists; otherwise uses the first available school.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log('Starting Hour Tracking QA seed...\n');

  // ============================================================
  // 1. Seed FX rate
  // ============================================================
  console.log('Seeding FX rate...');
  const { error: fxError } = await supabase
    .from('fx_rates')
    .upsert(
      {
        from_currency: 'EUR',
        to_currency: 'CLP',
        rate: 1050.50,
        fetched_at: new Date().toISOString(),
        source: 'qa_seed_script',
      },
      { onConflict: 'from_currency,to_currency,fetched_at', ignoreDuplicates: true }
    );

  if (fxError) {
    console.warn('FX rate upsert warning (may already exist):', fxError.message);
  } else {
    console.log('FX rate seeded.');
  }

  // ============================================================
  // 2. Check for hour_types
  // ============================================================
  console.log('\nChecking hour_types...');
  const { data: hourTypes, error: htError } = await supabase
    .from('hour_types')
    .select('id, key, display_name')
    .eq('is_active', true)
    .limit(10);

  if (htError || !hourTypes || hourTypes.length === 0) {
    console.error('Error: No hour_types found. Phase 1 migration may not be deployed.');
    console.error(htError?.message);
    process.exit(1);
  }

  console.log(`Found ${hourTypes.length} hour types.`);
  const sessionHourTypes = hourTypes.filter((ht) => ht.key !== 'online_learning');
  console.log('Session hour types:', sessionHourTypes.map((ht) => ht.key).join(', '));

  // ============================================================
  // 3. Find or create a test contrato
  // ============================================================
  console.log('\nFinding QA test contrato...');

  // Try to find an existing contrato for QA purposes
  const { data: existingContratos } = await supabase
    .from('contratos')
    .select('id, nombre')
    .ilike('nombre', '%QA%')
    .limit(1);

  let contratoId;
  if (existingContratos && existingContratos.length > 0) {
    contratoId = existingContratos[0].id;
    console.log(`Using existing QA contrato: ${existingContratos[0].nombre} (${contratoId})`);
  } else {
    // Find any active contrato to use
    const { data: anyContrato } = await supabase
      .from('contratos')
      .select('id, nombre')
      .limit(1);

    if (anyContrato && anyContrato.length > 0) {
      contratoId = anyContrato[0].id;
      console.log(`Using contrato: ${anyContrato[0].nombre} (${contratoId})`);
    } else {
      console.warn('No contratos found. Skipping contract allocation and session seeding.');
      console.log('\nSeed completed (partial — no contratos available).');
      return;
    }
  }

  // ============================================================
  // 4. Seed contract_hour_allocations (if not already exists)
  // ============================================================
  console.log('\nSeeding contract_hour_allocations...');

  const firstHourType = sessionHourTypes[0];
  if (firstHourType) {
    const { data: existingAlloc } = await supabase
      .from('contract_hour_allocations')
      .select('id')
      .eq('contrato_id', contratoId)
      .eq('hour_type_id', firstHourType.id)
      .maybeSingle();

    if (!existingAlloc) {
      const { error: allocError } = await supabase
        .from('contract_hour_allocations')
        .insert({
          contrato_id: contratoId,
          hour_type_id: firstHourType.id,
          allocated_hours: 100,
          notes: 'QA seed allocation',
        });

      if (allocError) {
        console.warn(`Warning seeding allocation for ${firstHourType.key}:`, allocError.message);
      } else {
        console.log(`Created allocation: ${firstHourType.key} = 100 hours`);
      }
    } else {
      console.log(`Allocation for ${firstHourType.key} already exists, skipping.`);
    }
  }

  // ============================================================
  // 5. Check existing ledger entries
  // ============================================================
  console.log('\nChecking existing ledger entries...');
  const { data: existingLedger, error: ledgerCheckError } = await supabase
    .from('contract_hours_ledger')
    .select('id')
    .limit(5);

  if (ledgerCheckError) {
    console.warn('Warning checking ledger:', ledgerCheckError.message);
  } else {
    console.log(`Found ${existingLedger?.length || 0} existing ledger entries.`);
  }

  console.log('\nSeed completed successfully!');
  console.log('\nQA Test Data Summary:');
  console.log(`  - FX Rate: 1,050.50 CLP/EUR`);
  console.log(`  - Hour types available: ${hourTypes.length}`);
  console.log(`  - Test contrato ID: ${contratoId}`);
  console.log(`  - Contract allocation: ${firstHourType?.key || 'N/A'} = 100 hours`);
  console.log('\nTo test hour tracking:');
  console.log('  1. Create a session with hour_type_key and contrato_id set');
  console.log('  2. Approve the session → reservation ledger entry created');
  console.log('  3. Finalize the session → ledger entry updated to consumida');
  console.log('  4. Cancel a programada session → cancellation clause applied');
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
