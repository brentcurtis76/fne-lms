// The harness's hand-kept rules. Each entry says why it is there.

// Once signed in, the harness refuses every request that is not a plain read (GET), because some pages write just by
// being opened and two runs must see the same database. These are the exceptions: reads that are made with POST.
// "METHOD /path" is matched. Add one only after reading the code behind it.
export const ALLOW_POST = [
  /^POST \/auth\/v1\/token$/, // the sign-in library renewing its own session
  // Database functions that only read (their names and bodies say so):
  /^POST \/rest\/v1\/rpc\/(current_password_change_state|has_feedback_permission|get_my_meeting_rights|get_school_user_counts)$/,
  // API routes that read with POST (no insert, update, delete or function call in their code):
  /^POST \/api\/reports\/detailed$/, // /detailed-reports
  /^POST \/api\/courses\/search-assignees$/, // /admin/courses/[id]/assign
  /^POST \/api\/learning-paths\/search-assignees$/, // /admin/learning-paths/[id]/assign
];
// Seen and left refused, because they write: POST /api/learning-paths/session/start (opening a route starts a
// study session), POST /api/licitaciones/check-deadlines (opening a licitación may send reminders),
// POST /rest/v1/workspace_activities (opening the workspace logs the visit).

// Addresses that send a signed-in person to the panel when opened directly (they ask for the session before it is
// ready) but work when reached by a click. 'all' = try a click for every address that lands on the panel.
export const REACH_BY_CLICK = 'all';

// Outside hosts whose answers are fetched once, kept (in the state folder, outside the repository) and replayed, so
// that pictures show the real typefaces and thumbnails and still do not depend on the network. Everything else
// outside this machine is refused.
export const OUTSIDE_KEPT = [
  'fonts.googleapis.com', 'fonts.gstatic.com', // the platform's typefaces
  'cdnjs.cloudflare.com', // a stylesheet the frame links
  'ui-avatars.com', // avatars drawn from a person's initials
  'img.youtube.com', 'i.ytimg.com', // thumbnails of the panel's videos
];

// What some roles must add to an address to see it filled: '?' is a query string, '#' a fragment. (The ids for
// addresses with a changing part come from the sample-content files under seed/, each in its `params`.)
export const EXTRA_PARAMS = {
  // An admin has no school of their own: without a school the page shows only the school picker.
  '/school/transversal-context': { admin: { '?': 'school_id=990001' } },
  '/school/migration-plan': { admin: { '?': 'school_id=990001' } },
};

// Things that are different every time by their nature, hidden before a picture (their place is kept, so the layout
// does not move). `route` is matched against the address pattern; `selector` is a CSS selector, `text` a pattern for
// the whole text of the smallest element that holds it. Add one only for something that cannot be made to hold still.
export const MASKS = [
  { route: /^\/student\/lesson\//, text: /^\s*\d+:\d\d\s*$/, why: 'the lesson shows a running clock of the time spent on it' },
  { route: /^\/meet\/diag$/, text: /[kMG]B libres de/, why: 'the browser\'s free storage, a different figure every time' },
  { route: /^\/meet\/diag$/, text: /Mbps \(\w+\)/, why: 'the browser\'s own estimate of the connection, a different figure every time' },
  { route: /^\/meet\/diag$/, selector: 'textarea', why: 'the diagnosis report to copy: it repeats the figures above and the time it was made' },
  { route: /^\/meet\/diag$/, selector: '[data-testid="diag-row-screen"]', why: 'the screen size the browser reports: the harness makes its window as tall as the page, so the figure (and its OK or Atención mark) depends on whether the page measured before or after' },
  { route: /^\/meet\/diag$/, selector: '[data-testid="diag-summary"]', why: 'the count of OK and Atención marks: it counts the screen row above' },
  { route: /^\/admin\/test-session$/, selector: 'pre', why: 'the page prints the visitor\'s own session, its keys included: new at every sign-in' },
];
