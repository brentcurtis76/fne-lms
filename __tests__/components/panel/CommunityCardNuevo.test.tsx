// @vitest-environment jsdom
/**
 * Redesign 6B, send-back 3, point 2: the opened community card gives its label and its members'
 * names room. The place's name sits on a row of its own, with the gear and «Ver Espacio Completo →»
 * on one row under it; a tile's name, role and partner school wrap in full (nothing truncates them).
 * The structure is asserted, not pixels. Invented people and places only.
 */
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommunityCardNuevo } from '@/components/panel/CommunityCardNuevo';

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

afterEach(() => cleanup());

const PLACE = 'Colegio Inventado de Nombre Bastante Largo Para Probar';
const LONG_NAME = 'Maximiliana Escarlata Fernández-Villavicencio';

const members = [
  { id: 'm-1', first_name: 'Maximiliana Escarlata', last_name: 'Fernández-Villavicencio', avatar_url: null, user_roles: [{ role_type: 'lider_comunidad' }] },
  { id: 'm-2', first_name: 'Asesor', last_name: 'Ficticio', avatar_url: null, external_school_affiliation: 'escola_sadako', user_roles: [{ role_type: 'consultor' }] },
  { id: 'm-3', first_name: 'Docente', last_name: 'Inventada', avatar_url: null, user_roles: [{ role_type: 'docente' }] },
];

function draw(canEdit: boolean) {
  const panel = {
    user: { id: 'm-1' },
    communityExpanded: true,
    toggleCommunity: () => {},
    chooseCommunity: () => {},
    openWorkspaceSettings: () => {},
    openMember: () => {},
  } as any;
  const community = {
    userCommunities: [],
    effectiveCommunityId: 'c-1',
    selectedRole: { id: 'r-1', community_id: 'c-1', school: { name: PLACE }, community: { name: 'Comunidad Inventada' } },
    members,
    workspace: null,
    showCommunityPicker: false,
    canEditWorkspace: () => canEdit,
  } as any;
  render(<CommunityCardNuevo panel={panel} community={community} />);
  return screen.getByTestId('panel-community-open');
}

const TRUNCATING = /^(truncate|text-ellipsis|line-clamp-\d+|whitespace-nowrap|overflow-hidden)$/;
const truncatingClasses = (element: Element) =>
  (element.getAttribute('class') ?? '').split(/\s+/).filter((name) => TRUNCATING.test(name));

describe('the opened community card: its label and its members\' texts have room', () => {
  it('the place\'s name is a row of its own; the gear and the link share the row under it, at the right', () => {
    const open = draw(true);
    const label = within(open).getByRole('heading', { level: 3, name: PLACE });
    expect(truncatingClasses(label)).toEqual([]);
    expect(label.getAttribute('class')).toContain('break-words');
    // The row under the label holds the actions, and nothing of the label.
    const actions = label.nextElementSibling!;
    expect(actions).not.toBeNull();
    expect(actions.contains(label)).toBe(false);
    expect(within(actions as HTMLElement).getByTestId('panel-community-settings')).toBeTruthy();
    expect(within(actions as HTMLElement).getByRole('link', { name: 'Ver Espacio Completo →' }).getAttribute('href')).toBe('/community/workspace');
    expect(actions.getAttribute('class')).toContain('justify-end');
    // Label and actions are two rows: siblings stacked in a grid, not one flex row.
    const head = label.parentElement!;
    expect(head.getAttribute('class')).toContain('grid');
    expect(head.getAttribute('class')).not.toMatch(/\bflex\b/);
  });

  it('without the right to edit: the link alone on the row under the label', () => {
    const open = draw(false);
    const label = within(open).getByRole('heading', { level: 3, name: PLACE });
    const actions = label.nextElementSibling as HTMLElement;
    expect(within(actions).queryByTestId('panel-community-settings')).toBeNull();
    expect(within(actions).getByRole('link', { name: 'Ver Espacio Completo →' })).toBeTruthy();
  });

  it('a tile\'s name, role and partner school are written whole, nothing truncates them', () => {
    const open = draw(true);
    const own = within(open).getByTestId('panel-member-m-1');
    const name = within(own).getByText(LONG_NAME);
    const role = within(own).getByText('Líder de Comunidad');
    expect(truncatingClasses(name)).toEqual([]);
    expect(truncatingClasses(role)).toEqual([]);
    expect(name.getAttribute('class')).toContain('break-words');
    expect(role.getAttribute('class')).toContain('break-words');
    expect(within(own).getByText('Tú')).toBeTruthy();

    const consultor = within(open).getByTestId('panel-member-m-2');
    const school = within(consultor).getByText('Escola Sadako');
    expect(truncatingClasses(school)).toEqual([]);
    expect(school.getAttribute('class')).toContain('break-words');

    // Every tile starts its texts at its top, so tiles of one row keep the same top alignment.
    for (const id of ['m-1', 'm-2', 'm-3']) {
      const tile = within(open).getByTestId(`panel-member-${id}`);
      expect(tile.tagName).toBe('BUTTON');
      expect(tile.getAttribute('class')).toContain('content-start');
      expect(truncatingClasses(tile)).toEqual([]);
    }
  });
});

/*
 * Send-back «by sight», point 4: the bar's line keeps «{n} miembros» together (CSS only: the text is
 * exactly today's, no other character), and the place's label in the opened card is the size and
 * colour of the view's other small labels, letter-spacing no wider than 0.08em. Its colour on the
 * card's white is the pair «a card's secondary text» of the contrast test (gray 600 on white).
 */
describe('the community card\'s line and label read easily', () => {
  it('the bar\'s line: «{n} miembros» on one line, the text unchanged', () => {
    draw(true);
    const line = screen.getByTestId('panel-community-line');
    expect(line.textContent).toBe(`${PLACE} • 3 miembros`);
    expect(line.textContent).not.toMatch(/[  ⁠]/);
    const together = [...line.querySelectorAll('span')].find((el) => el.textContent === '3 miembros');
    expect(together).toBeTruthy();
    expect(together!.getAttribute('class')).toBe('whitespace-nowrap');
    // The place's name itself may wrap.
    expect(line.getAttribute('class')).not.toContain('whitespace-nowrap');
  });

  it('the place\'s label: a third-level heading, small type, gray 600, bold, tracking at most 0.08em', () => {
    const open = draw(true);
    const label = within(open).getByRole('heading', { level: 3, name: PLACE });
    const names = (label.getAttribute('class') ?? '').split(/\s+/);
    expect(names).toEqual(expect.arrayContaining(['text-xs', 'text-gray-600', 'font-bold', 'uppercase']));
    expect(names.filter((n) => /^font-(thin|extralight|light|normal|medium)$/.test(n))).toEqual([]);
    const tracking = names.filter((n) => n.startsWith('tracking-'));
    expect(tracking).toHaveLength(1);
    const em = /^tracking-\[(\d*\.?\d+)em\]$/.exec(tracking[0]);
    expect(em).not.toBeNull();
    expect(Number(em![1])).toBeLessThanOrEqual(0.08);
  });
});
