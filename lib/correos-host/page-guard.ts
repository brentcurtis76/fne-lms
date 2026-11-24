/**
 * The page protection of every Correos screen, as `pages/admin/correos/vista-previa.tsx` does it: the verified
 * user (else sign in), the forced password change (else its page), the global admin (else the dashboard).
 * Server only (used from `getServerSideProps`).
 */
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { createServiceRoleClient, getForcedPasswordChangeVerdict, getServerSideUser } from '../api-auth';
import { forcedChangeRedirectPath } from '../auth/forced-password-change';
import { isGlobalAdmin } from '../../utils/roleUtils';

export async function correosAdminPage<P extends Record<string, unknown> = Record<string, never>>(
  context: GetServerSidePropsContext,
  props: P = {} as P
): Promise<GetServerSidePropsResult<P>> {
  const viewer = await getServerSideUser(context);
  if (!viewer) {
    return { redirect: { destination: `/login?next=${encodeURIComponent(context.resolvedUrl)}`, permanent: false } };
  }
  const service = createServiceRoleClient();
  const verdict = await getForcedPasswordChangeVerdict(service, viewer.id);
  if (verdict !== 'allowed') {
    return { redirect: { destination: forcedChangeRedirectPath(verdict), permanent: false } };
  }
  if (!(await isGlobalAdmin(service, viewer.id))) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }
  return { props };
}
