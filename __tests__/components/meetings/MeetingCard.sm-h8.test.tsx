// @vitest-environment jsdom
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/doc' }, error: null }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: 'a1', filename: 'acta.pdf', file_path: 'w/m/acta.pdf', file_type: 'application/pdf', file_size: 10 }], error: null }) }) }),
    }),
    storage: { from: () => ({ createSignedUrl, getPublicUrl: vi.fn() }) },
  }),
}));
vi.mock('../../../components/meetings/TaskTracker', () => ({
  __esModule: true,
  default: ({ item }: any) => <div data-testid="tracker">{item.commitment_text ?? item.task_title}</div>,
}));

import MeetingCard from '../../../components/meetings/MeetingCard';

const meeting: any = {
  id: 'm1', title: 'Reunión', status: 'completada', meeting_date: '2026-10-02T19:00:00.000Z', duration_minutes: 60,
  agreements: [{ id: 'g1', agreement_text: 'Acuerdo uno' }],
  commitments: [
    { id: 'c1', commitment_text: 'Compromiso uno', status: 'pendiente', due_date: '2026-10-10' },
    { id: 'c2', commitment_text: 'Compromiso dos', status: 'pendiente', due_date: '2026-10-11' },
  ],
  tasks: [{ id: 't1', task_title: 'Tarea uno', status: 'pendiente', due_date: '2026-10-12' }],
  attendees: [],
};

describe('MeetingCard (SM-H8)', () => {
  it('counts acuerdos and compromisos separately', () => {
    const { getByTestId } = render(<MeetingCard meeting={meeting} canEdit={false} />);
    expect(getByTestId('meeting-chip-agreements-m1').textContent).toContain('Acuerdos (1)');
    expect(getByTestId('meeting-chip-commitments-m1').textContent).toContain('Compromisos (2)');
    expect(getByTestId('meeting-chip-tasks-m1').textContent).toContain('Tareas (1)');
  });

  it('the compromisos chip shows only commitments, the acuerdos chip only agreements', () => {
    const { getByTestId, queryByText, getAllByTestId } = render(<MeetingCard meeting={meeting} canEdit={false} />);
    fireEvent.click(getByTestId('meeting-chip-agreements-m1'));
    expect(queryByText('Acuerdo uno')).not.toBeNull();
    expect(queryByText('Compromiso uno')).toBeNull();
    fireEvent.click(getByTestId('meeting-chip-commitments-m1'));
    expect(getAllByTestId('tracker').map((el) => el.textContent)).toEqual(['Compromiso uno', 'Compromiso dos']);
    expect(queryByText('Acuerdo uno')).toBeNull();
  });

  it('shows the delete button only to someone allowed to delete, and calls back with the id', () => {
    const onDelete = vi.fn();
    const { queryByTestId, rerender } = render(<MeetingCard meeting={meeting} canEdit onDelete={onDelete} />);
    expect(queryByTestId('meeting-delete-m1')).toBeNull();
    rerender(<MeetingCard meeting={meeting} canEdit canDelete onDelete={onDelete} />);
    fireEvent.click(queryByTestId('meeting-delete-m1')!);
    expect(onDelete).toHaveBeenCalledWith('m1');
  });

  it('the eye calls onView', () => {
    const onView = vi.fn();
    const { getByTestId } = render(<MeetingCard meeting={meeting} canEdit={false} onView={onView} />);
    fireEvent.click(getByTestId('meeting-view-m1'));
    expect(onView).toHaveBeenCalledWith('m1');
  });

  it('without read access: no documents chip, no task stats, and an explanation', () => {
    const empty = { ...meeting, agreements: [], commitments: [], tasks: [] };
    const { queryByText, getByTestId } = render(<MeetingCard meeting={empty} canEdit={false} canReadContent={false} />);
    expect(queryByText('Documentos')).toBeNull();
    expect(getByTestId('meeting-content-hidden-m1').textContent).toContain('Solo los participantes');
  });

  it('documents open through a short-lived signed link (private bucket)', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { getByText, findByTitle } = render(<MeetingCard meeting={meeting} canEdit={false} />);
    fireEvent.click(getByText('Documentos'));
    fireEvent.click(await findByTitle('Descargar documento'));
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('https://signed.example/doc', '_blank'));
    expect(createSignedUrl).toHaveBeenCalledWith('w/m/acta.pdf', 60);
    open.mockRestore();
  });
});
