import type { RecurrenceFrequency } from '../../lib/types/consultor-sessions.types';
import type { Facilitator } from './sessionCreateTypes';

/**
 * The 12 checks of the form «Programar Sesión», for the new look (redesign 6, release SB, approved
 * change 2): EVERY check that fails, in today's order and with today's words, where today's
 * `validateForm()` (hooks/useSessionCreate.ts) toasts only the first one. Each condition is written
 * exactly as today's, so the first failure here is always today's toast. Every check is asked on its own, so check 10 also
 * fails beside check 9 when no facilitator is chosen. Pure: no React, no toast, no request.
 *
 * Each failure names the field its link moves to and its message sits beside (placement approved with
 * the mock-up): 1 school, 2 community, 3 title, 4 date, 5 the empty time (start, else end), 6 end,
 * 7 meeting link, 8 location, 9 and 10 the consultants block (the school while none is chosen, as the
 * block is not drawn then), 11 the custom dates, 12 the series count.
 */

export type CreateCheckKey =
  | 'school'
  | 'community'
  | 'title'
  | 'date'
  | 'times'
  | 'endAfterStart'
  | 'meetingLink'
  | 'location'
  | 'facilitators'
  | 'lead'
  | 'customDates'
  | 'recurrenceCount';

/** The ids the new view gives its fields, so a failure's link can move to one. */
export const CREATE_FIELD_IDS = {
  school: 'create-session-school',
  community: 'create-session-community',
  title: 'create-session-title',
  date: 'create-session-date',
  start: 'create-session-start',
  end: 'create-session-end',
  meetingLink: 'create-session-meeting-link',
  location: 'create-session-location',
  consultants: 'create-session-consultants',
  customDates: 'create-session-custom-date-0',
  recurrenceCount: 'create-session-recurrence-count',
} as const;

export interface CreateCheckFailure {
  key: CreateCheckKey;
  /** Today's toast, word for word. */
  message: string;
  /** The id of the field the box's link moves to. */
  fieldId: string;
}

export interface CreateCheckInput {
  formData: {
    school_id: number;
    growth_community_id: string;
    title: string;
    session_date: string;
    start_time: string;
    end_time: string;
    modality: 'presencial' | 'online' | 'hibrida';
    meeting_link: string;
    is_zoom_managed: boolean;
    location: string;
  };
  facilitators: Facilitator[];
  isRecurring: boolean;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceCount: number;
  customDates: string[];
}

export function formChecks({
  formData,
  facilitators,
  isRecurring,
  recurrenceFrequency,
  recurrenceCount,
  customDates,
}: CreateCheckInput): CreateCheckFailure[] {
  const out: CreateCheckFailure[] = [];
  const fail = (key: CreateCheckKey, message: string, fieldId: string) => out.push({ key, message, fieldId });

  // 1-4
  if (formData.school_id <= 0) fail('school', 'Debe seleccionar un colegio', CREATE_FIELD_IDS.school);
  if (!formData.growth_community_id) {
    fail('community', 'Debe seleccionar una comunidad de crecimiento', CREATE_FIELD_IDS.community);
  }
  if (!formData.title.trim()) fail('title', 'Debe ingresar un título', CREATE_FIELD_IDS.title);
  if (!formData.session_date) fail('date', 'Debe seleccionar una fecha', CREATE_FIELD_IDS.date);

  // 5 and 6: today's 6 is reached only when 5 passed (it reads both times).
  if (!formData.start_time || !formData.end_time) {
    fail(
      'times',
      'Debe ingresar hora de inicio y término',
      formData.start_time ? CREATE_FIELD_IDS.end : CREATE_FIELD_IDS.start
    );
  } else {
    const [startHour, startMin] = formData.start_time.split(':').map(Number);
    const [endHour, endMin] = formData.end_time.split(':').map(Number);
    if (endHour * 60 + endMin <= startHour * 60 + startMin) {
      fail('endAfterStart', 'La hora de término debe ser posterior a la hora de inicio', CREATE_FIELD_IDS.end);
    }
  }

  // 7
  if (
    (formData.modality === 'online' || formData.modality === 'hibrida') &&
    !formData.is_zoom_managed &&
    !formData.meeting_link
  ) {
    fail('meetingLink', 'Debe ingresar un enlace de reunión para modalidad online o híbrida', CREATE_FIELD_IDS.meetingLink);
  }

  // 8
  if ((formData.modality === 'presencial' || formData.modality === 'hibrida') && !formData.location) {
    fail('location', 'Debe ingresar una ubicación para modalidad presencial o híbrida', CREATE_FIELD_IDS.location);
  }

  // 9 and 10, each asked on its own: with no facilitator there is no lead either, so both fail (the
  // scenarios of SB, D6, list both for an empty form; today the toast of 9 stops before 10 is asked).
  if (facilitators.length === 0) {
    fail(
      'facilitators',
      'Debe asignar al menos un facilitador a la sesión',
      formData.school_id > 0 ? CREATE_FIELD_IDS.consultants : CREATE_FIELD_IDS.school
    );
  }
  if (facilitators.filter((f) => f.is_lead).length !== 1) {
    fail(
      'lead',
      'Debe haber exactamente un facilitador principal',
      formData.school_id > 0 ? CREATE_FIELD_IDS.consultants : CREATE_FIELD_IDS.school
    );
  }

  // 11 and 12
  if (isRecurring) {
    if (recurrenceFrequency === 'custom') {
      if (customDates.filter((d) => d).length < 2) {
        fail('customDates', 'Debe ingresar al menos 2 fechas personalizadas', CREATE_FIELD_IDS.customDates);
      }
    } else if (recurrenceCount < 2 || recurrenceCount > 52) {
      fail('recurrenceCount', 'El número de sesiones debe estar entre 2 y 52', CREATE_FIELD_IDS.recurrenceCount);
    }
  }

  return out;
}
