// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * EC-V1b (GENERA fixes F12c): any member of a community renames its
 * workspace through the database function rename_community_workspace; the
 * picture keeps its direct update and never writes the name (N92). Synthetic
 * data only.
 */

const fake = vi.hoisted(() => ({ ref: null as any }));
vi.mock('../../../lib/supabase-wrapper', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  return { supabase: fake.ref.client };
});

import { communityWorkspaceService } from '../../../lib/services/communityWorkspace';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown };
};

const WS = 'ws-a';

beforeEach(() => {
  h.requests.length = 0;
  h.respond = () => ({ data: null, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('EC-V1b renameWorkspace', () => {
  it('calls rename_community_workspace with the workspace id and the name, and nothing else', async () => {
    const result = await (communityWorkspaceService as any).renameWorkspace(WS, 'Comunidad Lectora');
    expect(result).toEqual({ error: null });
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]).toMatchObject({
      kind: 'rpc',
      target: 'rename_community_workspace',
      args: { p_workspace_id: WS, p_name: 'Comunidad Lectora' },
    });
  });

  it.each([
    ['not_allowed', '42501', 'Solo los miembros de la comunidad pueden cambiar su nombre.'],
    ['invalid_name', '22023', 'El nombre debe tener entre 1 y 100 caracteres, con al menos una letra o un número, sin caracteres invisibles.'],
    ['Cannot coerce the result to a single JSON object', 'PGRST116', 'No se pudo guardar. Inténtalo de nuevo.'],
    ['permission denied for function rename_community_workspace', '42501', 'No se pudo guardar. Inténtalo de nuevo.'],
  ])('the database answer «%s» becomes a plain message', async (message, code, expected) => {
    h.respond = () => ({ data: null, error: { message, code } });
    const result = await (communityWorkspaceService as any).renameWorkspace(WS, 'Nombre');
    expect(result).toEqual({ error: expected });
  });

  it('a thrown failure (no network) becomes the plain message, never the raw text', async () => {
    h.respond = () => {
      throw new Error('Failed to fetch');
    };
    const result = await (communityWorkspaceService as any).renameWorkspace(WS, 'Nombre');
    expect(result).toEqual({ error: 'No se pudo guardar. Inténtalo de nuevo.' });
  });
});

describe('EC-V1b / N92 updateWorkspaceSettings never writes the name', () => {
  it('a picture update writes only the picture columns', async () => {
    h.respond = () => ({ data: { id: WS }, error: null });
    await communityWorkspaceService.updateWorkspaceSettings(WS, {
      customName: 'Espacio de Comunidad A',
      imageUrl: 'https://example.test/a.png',
      imageStoragePath: 'community-images/a.png',
    });
    const update = h.requests.find((req) => req.target === 'community_workspaces');
    const values = update?.ops.find((op) => op.method === 'update')?.args[0] as Record<string, unknown>;
    expect(values).toBeDefined();
    expect(values).not.toHaveProperty('custom_name');
    expect(values).toMatchObject({ image_url: 'https://example.test/a.png', image_storage_path: 'community-images/a.png' });
  });

  it('called without a picture change it does not touch the table', async () => {
    const result = await communityWorkspaceService.updateWorkspaceSettings(WS, { customName: 'Otro nombre' });
    expect(result.error).toBeNull();
    expect(h.requests).toHaveLength(0);
  });
});

describe('EC-V1 send-back 1: getWorkspaceSettings reads back what is stored', () => {
  it('reads custom_name and image_url of the one workspace and answers them', async () => {
    h.respond = () => ({ data: { custom_name: 'Comunidad Lectora', image_url: 'https://example.test/a.png' }, error: null });
    const result = await (communityWorkspaceService as any).getWorkspaceSettings(WS);
    expect(result).toEqual({ data: { custom_name: 'Comunidad Lectora', image_url: 'https://example.test/a.png' }, error: null });
    expect(h.requests).toHaveLength(1);
    const req = h.requests[0];
    expect(req).toMatchObject({ kind: 'from', target: 'community_workspaces' });
    expect(req.ops.find((op) => op.method === 'select')?.args[0]).toBe('custom_name, image_url');
    expect(req.ops.find((op) => op.method === 'eq')?.args).toEqual(['id', WS]);
    expect(req.ops.some((op) => op.method === 'update')).toBe(false);
  });

  it('a failed read answers an error and no data', async () => {
    h.respond = () => ({ data: null, error: { message: 'boom', code: 'XX000' } });
    const result = await (communityWorkspaceService as any).getWorkspaceSettings(WS);
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('no row answers an error and no data', async () => {
    h.respond = () => ({ data: null, error: null });
    const result = await (communityWorkspaceService as any).getWorkspaceSettings(WS);
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });
});
