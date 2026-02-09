/**
 * One-time fix: trim leading spaces from scenario names/descriptions
 * Run with: node scripts/fix-leading-spaces.js
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function fix() {
  // Get all scenarios with leading spaces that aren't docente/consultor
  const { data, error } = await supabase
    .from('qa_scenarios')
    .select('id, name, description')
    .not('role_required', 'in', '(docente,consultor)');

  if (error) {
    console.error('Query error:', error.message);
    process.exit(1);
  }

  let fixed = 0;
  for (const row of data) {
    const trimmedName = row.name ? row.name.trim() : row.name;
    const trimmedDesc = row.description ? row.description.trim() : row.description;
    const nameChanged = trimmedName !== row.name;
    const descChanged = trimmedDesc !== row.description;

    if (nameChanged || descChanged) {
      const { error: updateErr } = await supabase
        .from('qa_scenarios')
        .update({ name: trimmedName, description: trimmedDesc })
        .eq('id', row.id);
      if (updateErr) {
        console.error('Update error for', row.id, updateErr.message);
      } else {
        fixed++;
      }
    }
  }
  console.log('Fixed ' + fixed + ' rows');

  // Verify no leading spaces remain
  const { data: check } = await supabase
    .from('qa_scenarios')
    .select('name')
    .like('name', ' %');
  console.log('Remaining with leading space:', check ? check.length : 0);

  // Sample verification
  const { data: sample } = await supabase
    .from('qa_scenarios')
    .select('name, role_required')
    .eq('role_required', 'admin')
    .limit(3);
  console.log('\nSample admin scenarios after fix:');
  sample.forEach(s => console.log('  "' + s.name + '"'));
}

fix().catch(e => { console.error('Fatal:', e); process.exit(1); });
