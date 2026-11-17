// @vitest-environment jsdom
/**
 * Redesign 6C, step 4(b): the member profile pop-up gives a person the same thing in both looks. Each
 * case of the step-0 pin runs with `clasico` and with `nuevo`; what a person gets (`personView`) and
 * every `onClose` must be equal: texts with their count, buttons and the X with their state, links.
 * What may differ is the helper's one list, `LOOK_EXCEPTIONS`: the new eyebrow, and the three rows
 * «Colegio», «Generación», «Comunidad» with their values, which the new markup does not draw (approved
 * with the mock-up; the panel never sends them).
 * Every person is invented; the time zone is fixed.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { closeX, inBothLooks, personView, settle } from '../../helpers/popups';

vi.hoisted(() => {
  process.env.TZ = 'UTC';
});

const fake = vi.hoisted(() => ({ look: 'clasico' as 'clasico' | 'nuevo', log: [] as unknown[] }));

vi.mock('next/link', async () => ({ default: (await import('../../helpers/popups')).LinkFake }));
vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: fake.look, setLook: () => {} }) }));

import { MemberProfileModal } from '@/components/community/MemberProfileModal';
import type { UserProfile } from '@/types/roles';

const member = (over: Partial<UserProfile> = {}): UserProfile => ({
  id: 'member-inventado',
  email: 'persona.inventada@example.invalid',
  first_name: 'Persona',
  last_name: 'Inventada',
  avatar_url: undefined,
  created_at: '2026-03-04T15:00:00Z',
  user_roles: [{ role_type: 'docente' } as any],
  ...over,
});

// What a person gets; the exceptions (eyebrow, the three never-filled rows) are the helper's one list,
// `LOOK_EXCEPTIONS`.
const got = () => personView({ popup: 'member' });

let view: ReturnType<typeof render>;
async function draw(m: UserProfile | null, over: { isOpen?: boolean; isCurrentUser?: boolean } = {}) {
  view = render(
    <MemberProfileModal
      isOpen={over.isOpen ?? true}
      onClose={() => {
        fake.log.push('onClose');
      }}
      member={m}
      {...(over.isCurrentUser === undefined ? {} : { isCurrentUser: over.isCurrentUser })}
    />
  );
  await settle();
}

async function same(scenario: () => Promise<unknown[]>) {
  const results = await inBothLooks((look) => (fake.look = look), () => (fake.log = []), scenario, () => fake.log);
  expect(results.nuevo).toEqual(results.clasico);
}

/** One drawing per member, each unmounted before the next. */
async function each(cases: Array<[UserProfile | null, { isOpen?: boolean; isCurrentUser?: boolean }?]>) {
  const out: unknown[] = [];
  for (const [m, over] of cases) {
    await draw(m, over);
    out.push(got());
    view.unmount();
  }
  return out;
}

describe('the member profile pop-up in both looks: the same for a person', () => {
  it('M1. closed: no member; a member with the window closed', () => same(() => each([[null], [member(), { isOpen: false }]])));

  it('M2–M4. a photo; an initial; no first name; no name at all', () =>
    same(() =>
      each([
        [member({ avatar_url: 'https://example.invalid/foto-inventada.png' })],
        [member({ first_name: 'ana' })],
        [member({ first_name: undefined, last_name: 'Solo Apellido' })],
        [member({ first_name: '', last_name: '' })],
      ])
    ));

  it('M5. the viewer: «(Tú)»', () => same(() => each([[member(), { isCurrentUser: true }], [member(), { isCurrentUser: false }]])));

  it('M6. without a role and without an email', () => same(() => each([[member({ user_roles: [], email: undefined })], [member({ user_roles: undefined })]])));

  it('M7. the partner school row under today\'s condition', () =>
    same(() =>
      each([
        [member({ user_roles: [{ role_type: 'consultor' } as any], external_school_affiliation: 'escola_virolai' })],
        [member({ user_roles: [{ role_type: 'consultor' } as any], external_school_affiliation: 'escuela_inventada' })],
        [member({ user_roles: [{ role_type: 'consultor' } as any], external_school_affiliation: null })],
        [member({ external_school_affiliation: 'escola_virolai' })],
      ])
    ));

  it('M8. without a date: no «Miembro desde» row', () => same(() => each([[member({ created_at: undefined })]])));

  it('M9. the three never-filled rows aside, the rest is the same', () =>
    same(() =>
      each([
        [
          member({
            school: { id: 1, name: 'Colegio Inventado' } as any,
            generation: { id: 'g', name: 'Generación Inventada' } as any,
            community: { id: 'c', name: 'Comunidad Inventada' } as any,
          }),
        ],
      ])
    ));

  it('M10. «Cerrar», the X, Escape and «Ver Perfil Completo» (to /user/{id}) call onClose', () =>
    same(async () => {
      await draw(member());
      const href = screen.getByRole('link', { name: /Ver Perfil Completo/ }).getAttribute('href');
      fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar' }).find((b) => b.textContent?.trim() === 'Cerrar')!);
      fireEvent.click(closeX()!);
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
      fireEvent.click(screen.getByRole('link', { name: /Ver Perfil Completo/ }));
      await settle();
      return [href];
    }));
});
