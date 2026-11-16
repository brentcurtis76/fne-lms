// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * N87 (GENERA fixes F11): the workspace settings («Configuración de la
 * Comunidad») are offered only to the people the database lets save them —
 * an admin, or an active community manager of that community (rules
 * "admins_modify_all_workspaces" and "community_managers_modify_their_workspace"
 * on community_workspaces). The workspace page and the dashboard ask the same
 * question. Synthetic data only.
 */

const fake = vi.hoisted(() => ({ ref: null as any }));
vi.mock('../../../lib/supabase-wrapper', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  return { supabase: fake.ref.client };
});

import { communityWorkspaceService, canEditWorkspaceWithRoles } from '../../../lib/services/communityWorkspace';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown };
};

const WS = 'ws-a';
const COMMUNITY = 'community-a';
const OTHER = 'community-b';

function rolesAre(roles: Array<{ role_type: string; community_id: string | null }>) {
  h.respond = (req) => {
    if (req.target === 'community_workspaces') return { data: { community_id: COMMUNITY }, error: null };
    if (req.target === 'user_roles') return { data: roles, error: null };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  h.requests.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('N87 canEditWorkspace', () => {
  it.each([
    ['an admin', [{ role_type: 'admin', community_id: null }], true],
    ['a community manager of the community', [{ role_type: 'community_manager', community_id: COMMUNITY }], true],
    ['a docente of the community', [{ role_type: 'docente', community_id: COMMUNITY }], false],
    ['a líder de comunidad of the community', [{ role_type: 'lider_comunidad', community_id: COMMUNITY }], false],
    ['a community manager of another community', [{ role_type: 'community_manager', community_id: OTHER }], false],
    ['a consultor', [{ role_type: 'consultor', community_id: null }], false],
    ['nobody with a role', [], false],
  ])('%s → %s', async (_who, roles, expected) => {
    rolesAre(roles);
    expect(await communityWorkspaceService.canEditWorkspace('user-1', WS)).toEqual({ canEdit: expected, error: null });
  });

  it('answers false when the roles cannot be read', async () => {
    h.respond = (req) =>
      req.target === 'user_roles' ? { data: null, error: { code: 'XX000' } } : { data: { community_id: COMMUNITY }, error: null };
    expect((await communityWorkspaceService.canEditWorkspace('user-1', WS)).canEdit).toBe(false);
  });
});

describe('N87 canEditWorkspaceWithRoles (the dashboard\'s answer)', () => {
  it('is the same rule, from roles already loaded', () => {
    expect(canEditWorkspaceWithRoles([{ role_type: 'admin', community_id: null }], COMMUNITY)).toBe(true);
    expect(canEditWorkspaceWithRoles([{ role_type: 'community_manager', community_id: COMMUNITY }], COMMUNITY)).toBe(true);
    expect(canEditWorkspaceWithRoles([{ role_type: 'community_manager', community_id: OTHER }], COMMUNITY)).toBe(false);
    expect(canEditWorkspaceWithRoles([{ role_type: 'docente', community_id: COMMUNITY }], COMMUNITY)).toBe(false);
    expect(canEditWorkspaceWithRoles([{ role_type: 'community_manager', community_id: COMMUNITY, is_active: false }], COMMUNITY)).toBe(false);
    // A role served from the offline cache never grants the settings.
    expect(canEditWorkspaceWithRoles([{ role_type: 'admin', community_id: null, from_cache: true }], COMMUNITY)).toBe(false);
    expect(canEditWorkspaceWithRoles(null, COMMUNITY)).toBe(false);
  });
});
