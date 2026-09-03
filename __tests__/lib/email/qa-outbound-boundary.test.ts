// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { deliverOutboundEmail } from '../../../lib/email/provider';
import {
  authorizeRecipientUsersEmail,
  authorizeUserEmail,
} from '../../../lib/email/outbound-policy';

function userTenantClient(profileSchoolId: number | null, roleSchoolIds: number[], schools: any[]): any {
  return {
    from(table: string) {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { school_id: profileSchoolId }, error: null,
        }) }) }) };
      }
      if (table === 'user_roles') {
        const result = { data: roleSchoolIds.map((school_id) => ({ school_id })), error: null };
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          not: async () => result,
        };
        return chain;
      }
      if (table === 'schools') {
        return { select: () => ({ eq: (_column: string, id: number) => ({
          maybeSingle: async () => ({ data: schools.find((school) => school.id === id) ?? null, error: null }),
        }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function sourceFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [absolute] : [];
  });
}

describe('QA outbound e-mail boundary', () => {
  it('suppresses a user with any allowlisted QA association, including multi-role users', async () => {
    const decision = await authorizeUserEmail(
      userTenantClient(1, [1, 257], [
        { id: 1, tenant_kind: 'client', internal_zoom_testing_enabled: false },
        { id: 257, tenant_kind: 'qa', internal_zoom_testing_enabled: false },
      ]),
      'synthetic-user'
    );
    expect(decision).toEqual({ kind: 'suppressed_qa', schoolId: 257, reason: 'qa_tenant' });
  });

  it('authorizes a tenant-less legacy recipient batch from the recipient users', async () => {
    const clientDecision = await authorizeRecipientUsersEmail(
      userTenantClient(1, [], [
        { id: 1, tenant_kind: 'client', internal_zoom_testing_enabled: false },
      ]),
      ['synthetic-client-user'],
    );
    expect(clientDecision).toEqual({ kind: 'allow', scope: 'client', schoolId: 1 });

    const qaDecision = await authorizeRecipientUsersEmail(
      userTenantClient(257, [], [
        { id: 257, tenant_kind: 'qa', internal_zoom_testing_enabled: false },
      ]),
      ['synthetic-qa-user'],
    );
    expect(qaDecision).toEqual({ kind: 'suppressed_qa', schoolId: 257, reason: 'qa_tenant' });
  });

  it('does not invoke an injected transport for suppressed or refused mail', async () => {
    const transport = vi.fn();
    const message = { from: 'a@example.test', to: 'b@example.test', subject: 'x', html: 'x' };
    await expect(deliverOutboundEmail({
      authorization: { kind: 'suppressed_qa', schoolId: 257, reason: 'qa_tenant' },
      message,
      transport,
    })).resolves.toEqual({ status: 'suppressed_qa' });
    await expect(deliverOutboundEmail({
      authorization: { kind: 'refuse', reason: 'school_lookup_failed' },
      message,
      transport,
    })).resolves.toMatchObject({ status: 'refused' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('keeps every provider invocation behind the single audited module', () => {
    const roots = [path.join(process.cwd(), 'lib'), path.join(process.cwd(), 'pages')];
    const offenders = roots.flatMap(sourceFiles).filter((file) => {
      if (file.endsWith(path.join('lib', 'email', 'provider.ts'))) return false;
      const source = fs.readFileSync(file, 'utf8');
      return /from ['"]resend['"]|\.emails\.send\s*\(|api\.resend\.com\/emails/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
