// @vitest-environment node
// The kit's "send me a test" with a fake host (invented people, no network).
import { describe, expect, it, vi } from 'vitest';
import { sampleContent } from '../sample';
import { sendTestEmail, TEST_SUBJECT_PREFIX } from '../test-send';
import type { AdminIdentity, CorreosHost, SingleSendResult } from '../types';
import { validateContent } from '../validate';
import { AURORA } from './fixtures';

const ADMIN: AdminIdentity = { kind: 'admin', adminId: 'admin-1', email: 'admin.prueba@example.test' };

function fakeHost(result: SingleSendResult = { status: 'sent' }) {
  const sendSingle = vi.fn(async () => result);
  const host: CorreosHost = {
    brand: AURORA,
    baseUrl: 'https://aurora.example.test',
    identify: async () => ADMIN,
    sendSingle,
  };
  return { host, sendSingle };
}

const content = sampleContent({ baseUrl: 'https://aurora.example.test', pictureUrl: 'https://aurora.example.test/f.png' });

describe('sendTestEmail', () => {
  it('the sample is a valid email with one text, one picture and one button', () => {
    expect(validateContent(content)).toEqual([]);
    expect(content.blocks.map((b) => b.kind)).toEqual(['text', 'picture', 'button']);
  });

  it('sends exactly one message to the admin, subject prefixed', async () => {
    const { host, sendSingle } = fakeHost();
    await expect(sendTestEmail(host, ADMIN, content)).resolves.toEqual({ status: 'sent', to: ADMIN.kind === 'admin' ? ADMIN.email : '' });
    expect(sendSingle).toHaveBeenCalledTimes(1);
    const message = sendSingle.mock.calls[0][0];
    expect(message.to).toEqual({ address: 'admin.prueba@example.test', userId: 'admin-1' });
    expect(message.subject).toBe(`${TEST_SUBJECT_PREFIX}Novedades de este mes`);
    expect(message.subject.startsWith('[PRUEBA] ')).toBe(true);
    expect(message.html).toContain(AURORA.logo.url);
    expect(message.text).toContain('Ver las actividades');
  });

  it('takes no recipient from its caller', () => {
    // Three parameters: the host, the identity the host established, the content. No address.
    expect(sendTestEmail.length).toBe(3);
  });

  it('sends nothing for a visitor or a non-admin', async () => {
    for (const reason of ['not_signed_in', 'not_admin'] as const) {
      const { host, sendSingle } = fakeHost();
      await expect(sendTestEmail(host, { kind: 'refused', reason }, content)).resolves.toEqual({ status: 'refused', reason });
      expect(sendSingle).not.toHaveBeenCalled();
    }
  });

  it('sends nothing for invalid content', async () => {
    const { host, sendSingle } = fakeHost();
    const result = await sendTestEmail(host, ADMIN, { ...content, blocks: [] });
    expect(result.status).toBe('invalid');
    expect(sendSingle).not.toHaveBeenCalled();
  });

  it('reports the host refusing, not being configured, or throwing', async () => {
    await expect(sendTestEmail(fakeHost({ status: 'refused', reason: 'suppressed_qa' }).host, ADMIN, content)).resolves.toEqual({
      status: 'not_sent',
      reason: 'suppressed_qa',
    });
    await expect(sendTestEmail(fakeHost({ status: 'not_configured' }).host, ADMIN, content)).resolves.toEqual({
      status: 'not_configured',
    });
    const { host } = fakeHost();
    host.sendSingle = async () => {
      throw new Error('boom');
    };
    await expect(sendTestEmail(host, ADMIN, content)).resolves.toEqual({ status: 'not_sent', reason: 'send_failed' });
  });
});
