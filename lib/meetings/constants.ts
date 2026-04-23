/**
 * Meeting-UI policy constants.
 *
 * Hoisted out of component bodies so they sit next to backend contracts and
 * can be tuned in one place. Previously these lived as magic numbers /
 * inline allowlists scattered across MeetingDocumentationModal.tsx and
 * MeetingDetailsModal.tsx.
 */

/** Autosave debounce window — client waits this long after the last edit. */
export const AUTOSAVE_DEBOUNCE_MS = 2_000;

/**
 * Interval at which the "Guardado hace N" saved-time label re-ticks so the
 * displayed "hace 1 min" updates without forcing a full re-render cascade.
 */
export const SAVED_TICK_INTERVAL_MS = 10_000;

/**
 * Small animation delay before opening the delete-confirm dialog so the
 * parent modal has time to finish its close transition. Not a hard
 * dependency — shorter values produce a visual stutter; longer values feel
 * laggy.
 */
export const CLOSE_BEFORE_DELETE_MS = 150;

/** Max attachment size (10 MB). Mirrors backend validation. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Human-readable form of the attachment size cap for toast copy. */
export const MAX_ATTACHMENT_LABEL = '10 MB';

/**
 * MIME types accepted by the attachment picker. Kept in sync with the
 * backend storage bucket's allowed-uploads list.
 */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
];
