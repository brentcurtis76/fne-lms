// @vitest-environment node
/**
 * The low-level account-creation boundary enforces the shared password policy
 * ITSELF. Caller-side checks remain for early UX errors, but an account can no
 * longer be provisioned with a weak credential even if every caller forgets.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provisionAuthAccount } from '../../../lib/auth/account-provisioning';
import { PASSWORD_POLICY } from '../../../lib/auth/password-policy';
import { generatePassword } from '../../../utils/passwordGenerator';

function buildAdmin() {
  const createUser = vi.fn(async (attributes: Record<string, unknown>) => ({
    data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
    error: null,
    attributes,
  }));
  return { admin: { auth: { admin: { createUser } } } as any, createUser };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('provisionAuthAccount', () => {
  it('creates the account with exactly the pinned attributes', async () => {
    const { admin, createUser } = buildAdmin();
    const result = await provisionAuthAccount(admin, {
      email: 'sintetica@synthetic.test',
      password: 'Sintetica2026',
      emailConfirm: true,
      userMetadata: { role: 'docente' },
    });
    expect(result.error).toBeNull();
    expect(createUser).toHaveBeenCalledWith({
      email: 'sintetica@synthetic.test',
      password: 'Sintetica2026',
      email_confirm: true,
      user_metadata: { role: 'docente' },
      app_metadata: undefined,
    });
  });

  it.each([
    ['too short', 'Ab1'],
    ['no uppercase', 'sintetica2026'],
    ['no lowercase', 'SINTETICA2026'],
    ['no digit', 'SinteticaFuerte'],
    ['empty', ''],
  ])('refuses a %s password WITHOUT contacting the provider', async (_label, weak) => {
    const { admin, createUser } = buildAdmin();
    const result = await provisionAuthAccount(admin, {
      email: 'sintetica@synthetic.test',
      password: weak,
      emailConfirm: true,
    });
    expect(createUser).not.toHaveBeenCalled();
    expect(result.data.user).toBeNull();
    expect((result.error as any)?.code).toBe('weak_password');
    expect((result.error as any)?.status).toBe(400);
    // The refusal message is the shared policy's own es-CL sentence.
    expect((result.error as any)?.message).toMatch(/contraseña/i);
  });

  it('accepts every credential the platform generator mints', async () => {
    // The generated-credential paths (grant, bulk import, admin reset) must
    // never be refused by the boundary they now pass through.
    const { admin, createUser } = buildAdmin();
    for (let i = 0; i < 25; i += 1) {
      const password = generatePassword();
      expect(password.length).toBeGreaterThanOrEqual(PASSWORD_POLICY.minLength);
      const result = await provisionAuthAccount(admin, {
        email: `sintetica-${i}@synthetic.test`,
        password,
        emailConfirm: true,
      });
      expect(result.error).toBeNull();
    }
    expect(createUser).toHaveBeenCalledTimes(25);
  });
});
