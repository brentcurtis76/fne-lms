/**
 * SM-H8: what a meeting save must check before writing, and how a failed write
 * is told to the person.
 *
 * Owner rules (2 Oct 2026): acuerdos are not assigned to anyone; compromisos and
 * tareas need their text/title, a person and a due date, and that person must
 * be one of the meeting's participants (step 1). Saving is blocked until every
 * item is complete — the database would reject most of these anyway, and a
 * rejected write used to be swallowed while the modal said "Borrador guardado".
 *
 * Pure module: no Supabase, no React, so it is tested in the node environment.
 */

export type SaveItemKind =
  | 'meeting'
  | 'agreement'
  | 'commitment'
  | 'task'
  | 'participant'
  | 'reader'
  | 'attachment';

export type SaveItemField = 'text' | 'title' | 'assigned_to' | 'due_date';

export interface SaveProblem {
  kind: SaveItemKind;
  /** Position of the item in its form list (agreements/commitments/tasks). */
  index?: number;
  field?: SaveItemField;
  message: string;
}

export interface ValidatableMeetingForm {
  meeting_info: { attendee_ids: string[] };
  agreements: Array<{ agreement_text?: string | null }>;
  commitments: Array<{ commitment_text?: string | null; assigned_to?: string | null; due_date?: string | null }>;
  tasks: Array<{ task_title?: string | null; assigned_to?: string | null; due_date?: string | null }>;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar date as `<input type="date">` produces it, and a real one. */
export function isValidDueDate(value: string | null | undefined): boolean {
  const match = ISO_DATE.exec(value ?? '');
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const blank = (value: string | null | undefined) => !value || value.trim().length === 0;

function checkAssignee(
  kind: 'commitment' | 'task',
  index: number,
  assignedTo: string | null | undefined,
  participants: ReadonlySet<string>,
): SaveProblem | null {
  const noun = kind === 'commitment' ? 'compromiso' : 'tarea';
  if (blank(assignedTo)) {
    return { kind, index, field: 'assigned_to', message: `Elige a quién se asigna ${kind === 'commitment' ? 'este compromiso' : 'esta tarea'}.` };
  }
  if (!participants.has(assignedTo as string)) {
    return {
      kind,
      index,
      field: 'assigned_to',
      message: `La persona asignada a ${kind === 'commitment' ? 'este' : 'esta'} ${noun} ya no es participante. Asígnalo a un participante o vuelve a marcarla en el paso 1.`,
    };
  }
  return null;
}

/**
 * Every problem that blocks saving, in form order. Empty array = ready to save.
 */
export function validateMeetingItems(form: ValidatableMeetingForm): SaveProblem[] {
  const problems: SaveProblem[] = [];
  const participants = new Set(form.meeting_info.attendee_ids);

  form.agreements.forEach((agreement, index) => {
    if (blank(agreement.agreement_text)) {
      problems.push({ kind: 'agreement', index, field: 'text', message: 'Escribe el acuerdo o elimínalo.' });
    }
  });

  form.commitments.forEach((commitment, index) => {
    if (blank(commitment.commitment_text)) {
      problems.push({ kind: 'commitment', index, field: 'text', message: 'Describe el compromiso o elimínalo.' });
    }
    const assignee = checkAssignee('commitment', index, commitment.assigned_to, participants);
    if (assignee) problems.push(assignee);
    if (!isValidDueDate(commitment.due_date)) {
      problems.push({ kind: 'commitment', index, field: 'due_date', message: 'Indica la fecha límite del compromiso.' });
    }
  });

  form.tasks.forEach((task, index) => {
    if (blank(task.task_title)) {
      problems.push({ kind: 'task', index, field: 'title', message: 'Escribe el título de la tarea o elimínala.' });
    }
    const assignee = checkAssignee('task', index, task.assigned_to, participants);
    if (assignee) problems.push(assignee);
    if (!isValidDueDate(task.due_date)) {
      problems.push({ kind: 'task', index, field: 'due_date', message: 'Indica la fecha límite de la tarea.' });
    }
  });

  return problems;
}

/**
 * Commitments and tasks still assigned to `userId`. Used to warn when someone is
 * unticked from the participants (owner decision 5: warn, then block the save).
 */
export function itemsAssignedTo(
  form: Pick<ValidatableMeetingForm, 'commitments' | 'tasks'>,
  userId: string,
): { commitments: number; tasks: number } {
  return {
    commitments: form.commitments.filter((c) => c.assigned_to === userId).length,
    tasks: form.tasks.filter((t) => t.assigned_to === userId).length,
  };
}

const KIND_LABEL: Record<SaveItemKind, string> = {
  meeting: 'La reunión',
  agreement: 'Acuerdo',
  commitment: 'Compromiso',
  task: 'Tarea',
  participant: 'Participantes',
  reader: 'Personas con acceso',
  attachment: 'Documento',
};

/** "Compromiso 2", "Tarea 1", "Participantes". */
export function itemLabel(kind: SaveItemKind, index?: number): string {
  return index === undefined ? KIND_LABEL[kind] : `${KIND_LABEL[kind]} ${index + 1}`;
}

export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
}

/**
 * Plain Spanish for a failed write, by SQLSTATE. Never "guardado" on failure.
 */
export function describeSaveError(error: DbErrorLike | null | undefined, kind: SaveItemKind, index?: number): SaveProblem {
  const label = itemLabel(kind, index);
  const code = error?.code ?? '';
  let message: string;
  switch (code) {
    case '42501':
    case 'PGRST301':
      message = `${label}: no tienes permiso para guardar este cambio.`;
      break;
    case '23502':
    case '22007':
    case '22008':
      message = `${label}: falta la fecha o no es válida.`;
      break;
    case '22P02':
    case '23503':
      message = `${label}: falta la persona asignada o no es válida.`;
      break;
    case '23514':
      message = `${label}: el texto no puede quedar vacío.`;
      break;
    case '23505':
      message = `${label}: ya estaba registrado.`;
      break;
    default:
      message = `${label}: no se pudo guardar${error?.message ? ` (${error.message})` : ''}.`;
  }
  return { kind, index, message };
}

/** A write that reached no row: RLS refused it (PostgREST reports success). */
export function noRowsProblem(kind: SaveItemKind, index?: number): SaveProblem {
  return { kind, index, message: `${itemLabel(kind, index)}: no tienes permiso para guardar este cambio.` };
}

/** One toast line for a failed save; the inline messages carry the detail. */
export function saveFailureSummary(problems: SaveProblem[]): string {
  if (problems.length === 0) return '';
  const first = problems[0].message;
  return problems.length === 1 ? first : `${first} (y ${problems.length - 1} problema${problems.length - 1 === 1 ? '' : 's'} más)`;
}
