// SYNTHETIC FIXTURE.
import { recordSecurityAudit } from '../../../lib/security/audit';

export async function log(supabase: any) {
  await supabase.from('security_audit_events').insert({ action: 'meeting_deleted' });
  await recordSecurityAudit(supabase, { action: 'meeting_deleted', outcome: 'success' } as any);
}
