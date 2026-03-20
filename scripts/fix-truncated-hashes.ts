import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const client = createClient(supabaseUrl, serviceKey);

  // Find proposals with truncated access_code hashes
  const { data: affected, error } = await client
    .from('propuesta_generadas')
    .select('id, web_slug, access_code, access_code_plain')
    .not('access_code_plain', 'is', null)
    .not('access_code', 'is', null);

  if (error) { console.error('Query failed:', error); process.exit(1); }

  const truncated = (affected ?? []).filter(r => r.access_code && r.access_code.length < 60);
  console.log(`Found ${truncated.length} proposals with truncated hashes`);

  for (const row of truncated) {
    const newHash = await bcrypt.hash(row.access_code_plain, 10);
    const { error: updateErr } = await client
      .from('propuesta_generadas')
      .update({ access_code: newHash })
      .eq('id', row.id);
    if (updateErr) {
      console.error(`Failed to update ${row.web_slug}:`, updateErr);
    } else {
      console.log(`Fixed ${row.web_slug} (${row.id})`);
    }
  }
  console.log('Done');
}

main();
