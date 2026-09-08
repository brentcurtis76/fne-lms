// SYNTHETIC FIXTURE — deliberately .js, which the previous scan never opened.
export async function log(supabase) {
  await supabase.from('audit_logs').insert({ action: 'whatever' });
}
