// SYNTHETIC FIXTURE — never imported by the application. See
// __tests__/security/browser-boundary.test.ts.
import { useSupabaseClient } from '@supabase/auth-helpers-react';

export default function Bad() {
  const supabase = useSupabaseClient();
  const go = async () => {
    // The exact call `/reset-password` and `/change-password` both used to make.
    await supabase.auth.updateUser({ password: 'whatever' });
  };
  return <button onClick={go}>x</button>;
}
