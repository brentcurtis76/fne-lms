// @vitest-environment jsdom
// F12a EC-R3/R15: the person in charge of a task or commitment
// (canUpdateProgress) gets the state, progress and note controls; nothing
// that edits text, date or person in charge.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { updateTaskStatus } = vi.hoisted(() => ({ updateTaskStatus: vi.fn() }));
vi.mock('../../../utils/meetingUtils', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, updateTaskStatus };
});
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import TaskTracker from '../../../components/meetings/TaskTracker';

const task = (over: Record<string, unknown> = {}): any => ({
  id: 't1', meeting_id: 'm1', task_title: 'Enviar pauta', status: 'pendiente', priority: 'media',
  due_date: '2026-10-16', progress_percentage: 0, assigned_to: 'u-ana', notes: 'nota previa', ...over,
});

const editingControls = (container: HTMLElement) => ({
  textInputs: container.querySelectorAll('input[type="text"], input[type="date"], select').length,
});

beforeEach(() => {
  updateTaskStatus.mockReset();
  updateTaskStatus.mockResolvedValue({ success: true });
});

describe('TaskTracker — canUpdateProgress (F12a EC-R3/R15)', () => {
  it('canUpdateProgress true and canEdit false: state, progress and note controls, nothing that edits text, date or person', async () => {
    const utils = render(<TaskTracker item={task()} itemType="task" canEdit={false} canUpdateProgress />);
    expect(utils.getByRole('button', { name: /Iniciar/ })).toBeDefined();
    expect(utils.getByRole('button', { name: /Completar/ })).toBeDefined();
    expect(utils.getByRole('button', { name: /Notas/ })).toBeDefined();
    expect(utils.container.querySelector('input[type="range"]')).not.toBeNull();
    expect(editingControls(utils.container).textInputs).toBe(0);

    await act(async () => { fireEvent.click(utils.getByRole('button', { name: /Iniciar/ })); });
    expect(updateTaskStatus).toHaveBeenCalledWith('task', 't1', 'en_progreso', 25, 'nota previa');
  });

  it('canUpdateProgress true on a completed commitment: «Reabrir» calls the update', async () => {
    const commitment = { id: 'c1', meeting_id: 'm1', commitment_text: 'Enviar acta', status: 'completado', progress_percentage: 100, assigned_to: 'u-ana' };
    const utils = render(<TaskTracker item={commitment as any} itemType="commitment" canEdit={false} canUpdateProgress />);
    await act(async () => { fireEvent.click(utils.getByRole('button', { name: /Reabrir/ })); });
    expect(updateTaskStatus).toHaveBeenCalledWith('commitment', 'c1', 'en_progreso', 100, '');
  });

  it('both false: no control at all, the note is shown read-only', async () => {
    const utils = render(<TaskTracker item={task()} itemType="task" canEdit={false} canUpdateProgress={false} />);
    expect(utils.queryAllByRole('button')).toHaveLength(0);
    expect(utils.container.querySelector('input, textarea, select')).toBeNull();
    expect(utils.getByText('nota previa')).toBeDefined();
  });

  it('canUpdateProgress defaults to canEdit (editors exactly as today)', () => {
    const editor = render(<TaskTracker item={task()} itemType="task" canEdit />);
    expect(editor.getByRole('button', { name: /Iniciar/ })).toBeDefined();
    editor.unmount();
    const viewer = render(<TaskTracker item={task()} itemType="task" canEdit={false} />);
    expect(viewer.queryAllByRole('button')).toHaveLength(0);
  });
});
