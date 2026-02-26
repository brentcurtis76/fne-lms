import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

function parseScenariosFromSql(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const scenarios = [];

  // Match each VALUES tuple
  const tupleRegex = /\(\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'(\[.*?\])'::jsonb,\s*'(\[.*?\])'::jsonb,\s*(\d+),\s*(\d+),\s*(true|false),\s*(true|false),\s*(true|false)\s*\)/gs;

  let match;
  while ((match = tupleRegex.exec(sql)) !== null) {
    scenarios.push({
      role_required: match[1],
      name: match[2].replace(/''/g, "'"),
      description: match[3].replace(/''/g, "'"),
      feature_area: match[4],
      preconditions: JSON.parse(match[5].replace(/''/g, "'")),
      steps: JSON.parse(match[6].replace(/''/g, "'")),
      priority: parseInt(match[7]),
      estimated_duration_minutes: parseInt(match[8]),
      is_active: match[9] === 'true',
      automated_only: match[10] === 'true',
      is_multi_user: match[11] === 'true',
    });
  }
  return scenarios;
}

async function run() {
  const files = [
    'docs/qa-system/seed-admin-hour-tracking-scenarios.sql',
    'docs/qa-system/seed-consultor-hour-tracking-scenarios.sql',
    'docs/qa-system/seed-directivo-hour-tracking-scenarios.sql',
  ];

  let total = 0;
  for (const file of files) {
    const scenarios = parseScenariosFromSql(file);
    console.log(`${file.split('/').pop()}: ${scenarios.length} scenarios`);

    if (scenarios.length > 0) {
      const { error } = await supabase.from('qa_scenarios').insert(scenarios);
      if (error) {
        console.error(`  Bulk insert error: ${error.message}`);
        // Try one-by-one
        let ok = 0;
        for (const s of scenarios) {
          const { error: sErr } = await supabase.from('qa_scenarios').insert(s);
          if (sErr) {
            console.error(`  Failed: ${s.name} — ${sErr.message}`);
          } else {
            ok++;
          }
        }
        console.log(`  Inserted ${ok}/${scenarios.length} individually`);
        total += ok;
      } else {
        console.log('  Inserted OK');
        total += scenarios.length;
      }
    }
  }
  console.log(`\nTotal scenarios inserted: ${total}`);
}

run().catch(e => console.error(e));
