import { describe, it, expect } from 'vitest';
import {
  validateMeetingItems,
  describeSaveError,
  isValidDueDate,
  itemsAssignedTo,
  saveFailureSummary,
  noRowsProblem,
} from '../../../lib/meetings/meeting-save';

const ANA = 'a1';
const BRUNO = 'b2';

const form = (over: Partial<Parameters<typeof validateMeetingItems>[0]> = {}) => ({
  meeting_info: { attendee_ids: [ANA] },
  agreements: [],
  commitments: [],
  tasks: [],
  ...over,
});

describe('validateMeetingItems (SM-H8 owner rules)', () => {
  it('a complete form has no problems; agreements need no person or date', () => {
    expect(validateMeetingItems(form({
      agreements: [{ agreement_text: 'Acordamos X' }],
      commitments: [{ commitment_text: 'Enviar', assigned_to: ANA, due_date: '2026-10-10' }],
      tasks: [{ task_title: 'Preparar', assigned_to: ANA, due_date: '2026-10-11' }],
    }))).toEqual([]);
  });

  it('an empty agreement must be written or removed', () => {
    expect(validateMeetingItems(form({ agreements: [{ agreement_text: '  ' }] }))).toEqual([
      { kind: 'agreement', index: 0, field: 'text', message: 'Escribe el acuerdo o elimínalo.' },
    ]);
  });

  it('a commitment needs text, a person and a due date', () => {
    const problems = validateMeetingItems(form({ commitments: [{ commitment_text: '', assigned_to: '', due_date: '' }] }));
    expect(problems.map((p) => [p.kind, p.index, p.field])).toEqual([
      ['commitment', 0, 'text'], ['commitment', 0, 'assigned_to'], ['commitment', 0, 'due_date'],
    ]);
  });

  it('a task needs a title, a person and a due date (description is optional)', () => {
    const problems = validateMeetingItems(form({ tasks: [{ task_title: ' ', assigned_to: null, due_date: null }] }));
    expect(problems.map((p) => p.field)).toEqual(['title', 'assigned_to', 'due_date']);
    expect(problems[0].message).toBe('Escribe el título de la tarea o elimínala.');
  });

  it('the person must be a participant (step 1)', () => {
    const problems = validateMeetingItems(form({
      commitments: [{ commitment_text: 'x', assigned_to: BRUNO, due_date: '2026-10-10' }],
      tasks: [{ task_title: 'y', assigned_to: BRUNO, due_date: '2026-10-10' }],
    }));
    expect(problems).toHaveLength(2);
    expect(problems.every((p) => p.field === 'assigned_to' && p.message.includes('ya no es participante'))).toBe(true);
  });

  it('reports the position of each item', () => {
    const problems = validateMeetingItems(form({
      tasks: [
        { task_title: 'ok', assigned_to: ANA, due_date: '2026-10-10' },
        { task_title: 'sin fecha', assigned_to: ANA, due_date: '' },
      ],
    }));
    expect(problems).toEqual([{ kind: 'task', index: 1, field: 'due_date', message: 'Indica la fecha límite de la tarea.' }]);
  });
});

describe('isValidDueDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidDueDate('2026-02-28')).toBe(true);
    expect(isValidDueDate('2028-02-29')).toBe(true);
    expect(isValidDueDate('2026-02-29')).toBe(false);
    expect(isValidDueDate('2026-2-1')).toBe(false);
    expect(isValidDueDate('')).toBe(false);
    expect(isValidDueDate(undefined)).toBe(false);
  });
});

describe('itemsAssignedTo', () => {
  it('counts commitments and tasks for one person', () => {
    expect(itemsAssignedTo({
      commitments: [{ assigned_to: ANA }, { assigned_to: BRUNO }],
      tasks: [{ assigned_to: ANA }, { assigned_to: ANA }],
    }, ANA)).toEqual({ commitments: 1, tasks: 2 });
  });
});

describe('describeSaveError — plain Spanish by SQLSTATE, never "guardado"', () => {
  it.each([
    ['42501', 'Tarea 2: no tienes permiso para guardar este cambio.'],
    ['23502', 'Tarea 2: falta la fecha o no es válida.'],
    ['22007', 'Tarea 2: falta la fecha o no es válida.'],
    ['22P02', 'Tarea 2: falta la persona asignada o no es válida.'],
    ['23503', 'Tarea 2: falta la persona asignada o no es válida.'],
    ['23514', 'Tarea 2: el texto no puede quedar vacío.'],
  ])('%s', (code, message) => {
    expect(describeSaveError({ code, message: 'pg' }, 'task', 1).message).toBe(message);
  });

  it('unknown errors keep the database message', () => {
    expect(describeSaveError({ code: 'XX000', message: 'boom' }, 'meeting').message).toBe('La reunión: no se pudo guardar (boom).');
    expect(describeSaveError(null, 'participant').message).toBe('Participantes: no se pudo guardar.');
  });

  it('a write that reached no row is a permission problem', () => {
    expect(noRowsProblem('commitment', 0).message).toBe('Compromiso 1: no tienes permiso para guardar este cambio.');
  });

  it('summary names the first problem and counts the rest', () => {
    expect(saveFailureSummary([])).toBe('');
    expect(saveFailureSummary([noRowsProblem('task', 0)])).toBe('Tarea 1: no tienes permiso para guardar este cambio.');
    expect(saveFailureSummary([noRowsProblem('task', 0), noRowsProblem('task', 1), noRowsProblem('task', 2)]))
      .toBe('Tarea 1: no tienes permiso para guardar este cambio. (y 2 problemas más)');
  });
});
