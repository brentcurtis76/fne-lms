// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('../../../utils/meetingUtils', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, updateTaskStatus: vi.fn() };
});
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import TaskTracker from '../../../components/meetings/TaskTracker';

let previous: string | undefined;
beforeAll(() => {
  previous = process.env.TZ;
  process.env.TZ = 'America/Santiago';
});
afterAll(() => {
  if (previous === undefined) delete process.env.TZ;
  else process.env.TZ = previous;
});

describe('TaskTracker due date (SM-H9)', () => {
  it('shows the saved due day in Chile, not the day before', () => {
    const item: any = { id: 't1', meeting_id: 'm1', task_title: 'Enviar pauta', status: 'pendiente', priority: 'media', due_date: '2026-10-16', progress_percentage: 0 };
    const { container } = render(<TaskTracker item={item} itemType="task" canEdit={false} />);
    expect(container.textContent).toContain('16-10-2026');
    expect(container.textContent).not.toContain('15-10-2026');
  });
});
