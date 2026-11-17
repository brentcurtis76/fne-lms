// @vitest-environment jsdom
/**
 * Redesign 6C, step 0: today's member profile pop-up (`components/community/MemberProfileModal`) pinned
 * in the look `clasico` BEFORE its pure pieces move into a helper module and it gets a second markup.
 * Each case keeps one digest of the markup of the page body and of every `onClose` call and error
 * line (`memberProfile.pin.digests.json`; see `__tests__/helpers/pin.ts` and `__tests__/helpers/popups.tsx`).
 * Every person, school and address is invented; the time zone is fixed.
 */
import React from 'react';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePin, serialise } from '../../helpers/pin';
import { bodyMarkup, describeArg, settle } from '../../helpers/popups';

vi.hoisted(() => {
  process.env.TZ = 'UTC';
});

const fake = vi.hoisted(() => ({ log: [] as unknown[] }));

vi.mock('next/link', async () => ({ default: (await import('../../helpers/popups')).LinkFake }));
vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: 'clasico', setLook: () => {} }) }));

import { MemberProfileModal } from '@/components/community/MemberProfileModal';
import type { UserProfile } from '@/types/roles';

const { pinned, digestsFileHolds } = makePin(
  join(dirname(fileURLToPath(import.meta.url)), 'memberProfile.pin.digests.json'),
  'PANEL_MEMBER_PROFILE'
);

const theLog = () => serialise(fake.log);

let consoleError: { mockRestore: () => void } | null = null;
let consoleWarn: { mockRestore: () => void } | null = null;
beforeEach(() => {
  fake.log = [];
  consoleError = vi.spyOn(console, 'error').mockImplementation((first: unknown) => {
    if (typeof first === 'string' && !first.startsWith('Warning:')) fake.log.push({ 'console.error': first });
  });
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation((first: unknown) => {
    if (typeof first === 'string') fake.log.push({ 'console.warn': first });
  });
});
afterEach(() => {
  consoleError?.mockRestore();
  consoleWarn?.mockRestore();
});

const member =(over: Partial<UserProfile> = {}): UserProfile => ({
  id: 'member-inventado',
  email: 'persona.inventada@example.invalid',
  first_name: 'Persona',
  last_name: 'Inventada',
  avatar_url: undefined,
  created_at: '2026-03-04T15:00:00Z',
  user_roles: [{ role_type: 'docente' } as any],
  ...over,
});

let view: ReturnType<typeof render>;
async function draw(m: UserProfile | null, over: { isOpen?: boolean; isCurrentUser?: boolean } = {}) {
  const props = {
    isOpen: over.isOpen ?? true,
    onClose: (...args: unknown[]) => {
      fake.log.push({ onClose: args.map(describeArg) });
    },
    member: m,
    ...(over.isCurrentUser === undefined ? {} : { isCurrentUser: over.isCurrentUser }),
  };
  view = render(<MemberProfileModal {...props} />);
  await settle();
}

describe("today's member profile pop-up (MemberProfileModal), look clasico", () => {
  pinned('M1. closed: no member; a member with the window closed', async () => {
    await draw(null);
    const none = bodyMarkup();
    view.unmount();
    await draw(member(), { isOpen: false });
    return [none, bodyMarkup(), theLog()];
  });

  pinned('M2. a member with a photo, a role, an email and a date', async () => {
    await draw(member({ avatar_url: 'https://example.invalid/foto-inventada.png' }));
    return [bodyMarkup(), theLog()];
  });

  pinned('M3. only an initial (a first name in small letters), and no first name: «U»', async () => {
    await draw(member({ first_name: 'ana', last_name: 'Inventada' }));
    const initial = bodyMarkup();
    view.unmount();
    await draw(member({ first_name: undefined, last_name: 'Solo Apellido' }));
    return [initial, bodyMarkup(), theLog()];
  });

  pinned('M4. no name at all: «Usuario»', async () => {
    await draw(member({ first_name: '', last_name: '' }));
    return [bodyMarkup(), theLog()];
  });

  pinned('M5. the viewer: «(Tú)»', async () => {
    await draw(member(), { isCurrentUser: true });
    return [bodyMarkup(), theLog()];
  });

  pinned('M6. without a role («Sin rol asignado») and without an email', async () => {
    await draw(member({ user_roles: [], email: undefined }));
    const none = bodyMarkup();
    view.unmount();
    await draw(member({ user_roles: undefined }));
    return [none, bodyMarkup(), theLog()];
  });

  pinned('M7. a consultor with a partner school («Escuela externa»); an unknown value; without one; a docente with one', async () => {
    await draw(member({ user_roles: [{ role_type: 'consultor' } as any], external_school_affiliation: 'escola_virolai' }));
    const known = bodyMarkup();
    view.unmount();
    await draw(member({ user_roles: [{ role_type: 'consultor' } as any], external_school_affiliation: 'escuela_inventada' }));
    const unknown = bodyMarkup();
    view.unmount();
    await draw(member({ user_roles: [{ role_type: 'consultor' } as any], external_school_affiliation: null }));
    const without = bodyMarkup();
    view.unmount();
    await draw(member({ external_school_affiliation: 'escola_virolai' }));
    return [known, unknown, without, bodyMarkup(), theLog()];
  });

  pinned('M8. without a date: no «Miembro desde» row (today «No disponible» is never reached)', async () => {
    await draw(member({ created_at: undefined }));
    return [bodyMarkup(), theLog()];
  });

  pinned('M9. the three rows drawn when the member carries school, generation and community objects', async () => {
    await draw(
      member({
        school: { id: 1, name: 'Colegio Inventado' } as any,
        generation: { id: 'g', name: 'Generación Inventada' } as any,
        community: { id: 'c', name: 'Comunidad Inventada' } as any,
      })
    );
    return [bodyMarkup(), theLog()];
  });

  pinned('M10. «Cerrar», the X and Escape call onClose; «Ver Perfil Completo» goes to /user/{id} and closes', async () => {
    await draw(member());
    const link = screen.getByRole('link', { name: /Ver Perfil Completo/ });
    const href = link.getAttribute('href');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
    fireEvent.click(link);
    await settle();
    return [serialise({ href }), theLog()];
  });
});

it('nothing is drawn without a member', async () => {
  await draw(null);
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
});

digestsFileHolds(10);
