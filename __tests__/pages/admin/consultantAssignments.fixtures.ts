/**
 * Invented data for «Consultorías» (`/admin/consultant-assignments`) in both looks (redesign 6S,
 * release SC): five assignments (four active, one inactive; one complete), one per kind of scope.
 * Every person, school and address here is invented.
 */
import type { Scenario } from '../../helpers/sessionsFakes';
import type { ScTwoAnswers } from '../../helpers/scTwoFakes';

export const ADMIN = 'admin-inventado';
export const authOf = (id: string) => ({ access_token: `synthetic-token-${id}`, user: { id, email: `${id}@example.invalid` } });
export const LIST_GET = 'GET /api/admin/consultant-assignments?include_inactive=true';
export const deleteOf = (id: string) => `DELETE /api/admin/consultant-assignments?id=${id}`;

const person = (first: string, last: string, email: string) => ({ id: `p-${first}`, first_name: first, last_name: last, email });

export const ASSIGNMENTS = [
  {
    id: 'asg-1',
    consultant_id: 'con-1',
    student_id: 'est-1',
    assignment_type: 'comprehensive',
    can_view_progress: true,
    can_assign_courses: true,
    can_message_student: true,
    is_active: true,
    created_at: '2026-01-10T12:00:00Z',
    starts_at: '2026-01-10T12:00:00Z',
    consultant: person('Rosa', 'Inventada', 'rosa@example.invalid'),
    student: person('Tomás', 'Ficticio', 'tomas@example.invalid'),
  },
  {
    id: 'asg-2',
    consultant_id: 'con-1',
    student_id: null,
    community_id: 'com-1',
    assignment_type: 'monitoring',
    can_view_progress: true,
    can_assign_courses: false,
    can_message_student: false,
    is_active: true,
    created_at: '2026-02-10T12:00:00Z',
    consultant: person('Rosa', 'Inventada', 'rosa@example.invalid'),
  },
  {
    id: 'asg-3',
    consultant_id: 'con-2',
    student_id: null,
    school_id: 'esc-1',
    assignment_type: 'mentoring',
    can_view_progress: false,
    can_assign_courses: false,
    can_message_student: true,
    is_active: true,
    created_at: '2026-03-10T12:00:00Z',
    ends_at: '2026-12-31T12:00:00Z',
    consultant: { id: 'p-x', first_name: '', last_name: '', email: '' },
  },
  {
    id: 'asg-4',
    consultant_id: 'con-3',
    student_id: null,
    generation_id: 'gen-1',
    assignment_type: 'support',
    can_view_progress: true,
    can_assign_courses: false,
    can_message_student: false,
    is_active: true,
    created_at: '2026-04-10T12:00:00Z',
    consultant: person('Pablo', 'Supuesto', 'pablo@example.invalid'),
  },
  {
    id: 'asg-5',
    consultant_id: 'con-3',
    student_id: 'est-2',
    assignment_type: 'evaluation',
    can_view_progress: false,
    can_assign_courses: false,
    can_message_student: false,
    is_active: false,
    created_at: '2026-05-10T12:00:00Z',
    consultant: person('Pablo', 'Supuesto', 'pablo@example.invalid'),
    student: person('Lucía', 'Imaginaria', 'lucia@example.invalid'),
  },
];

export const ANSWERS: ScTwoAnswers = {
  profile: { first_name: 'Admin', last_name: 'Inventado', avatar_url: 'https://img.example.invalid/a.png' },
  counts: { community_id: 12, school_id: 1, generation_id: 0 },
  names: {
    growth_communities: { 'com-1': { id: 'com-1', name: 'Comunidad Inventada Sur' } },
    schools: { 'esc-1': { id: 'esc-1', name: 'Colegio Inventado Oeste' } },
    generations: { 'gen-1': { id: 'gen-1', name: 'Generación Ficticia 2026' } },
  },
};

export function assignmentsScenario(over: Partial<Scenario> = {}, rows: unknown[] = ASSIGNMENTS): Scenario {
  return {
    pathname: '/admin/consultant-assignments',
    session: authOf(ADMIN),
    role: 'admin',
    confirm: false,
    fetch: {
      [LIST_GET]: { body: { data: { assignments: rows } } },
      [deleteOf('asg-2')]: { body: { data: { ok: true } } },
    },
    ...over,
  };
}
