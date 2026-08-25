// SYNTHETIC FIXTURE.
export async function clearIt(supabase: any, id: string) {
  await supabase.from('profiles').update({ must_change_password: false }).eq('id', id);
}
