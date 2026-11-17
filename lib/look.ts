/**
 * The look of the platform for one account: today's ("clasico") or the redesign's ("nuevo").
 *
 * ONE SWITCH FOR THE WHOLE PLATFORM. The choice is a key in the account's own profile,
 * `profiles.learning_preferences.ui_look`: the value `"nuevo"` means the new look, anything
 * else (the key missing, which is the case for everyone until they choose) means today's.
 * It shows on the page as the attribute `data-look="nuevo"` on `<html>`; with today's look
 * the attribute is absent, so a page that nobody switched is exactly the page it was.
 *
 * Everything that needs to know the look asks here or `useLook()` (contexts/LookContext):
 * stylesheets through `[data-look="nuevo"]`, components through the hook. Nothing reads the
 * profile key on its own, so the rule of what counts as "nuevo" stays in one place. The
 * course screens' rebuild uses this same switch.
 *
 * This module is safe in the browser and on the server: it holds names and pure functions.
 */

export type Look = 'clasico' | 'nuevo';

/** The key inside `profiles.learning_preferences`. */
export const LOOK_PREFERENCE_KEY = 'ui_look';
/** The attribute on `<html>`; present (with the value "nuevo") only for the new look. */
export const LOOK_ATTRIBUTE = 'data-look';

export const isLook = (value: unknown): value is Look => value === 'clasico' || value === 'nuevo';

/** The look a profile's `learning_preferences` asks for. Anything unexpected is today's look. */
export function lookFromPreferences(preferences: unknown): Look {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return 'clasico';
  return (preferences as Record<string, unknown>)[LOOK_PREFERENCE_KEY] === 'nuevo' ? 'nuevo' : 'clasico';
}

/**
 * `learning_preferences` with the look written in, every other key kept. Today's look is
 * stored as the key's absence, so a profile that never chose and one that went back are the same.
 */
export function preferencesWithLook(preferences: unknown, look: Look): Record<string, unknown> {
  const kept: Record<string, unknown> =
    preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? { ...(preferences as Record<string, unknown>) }
      : {};
  delete kept[LOOK_PREFERENCE_KEY];
  if (look === 'nuevo') kept[LOOK_PREFERENCE_KEY] = 'nuevo';
  return kept;
}

/**
 * Puts a look on the page: the attribute on `<html>`. Browser only.
 *
 * Nothing is kept in the browser. The look is applied once the account's profile has loaded,
 * so on a full page load a person with the new look sees today's look for a moment first. That
 * is on purpose while the new look is offered to a few accounts: a copy kept in the browser
 * would belong to the computer, not the account, and on a shared school computer the next
 * person would get a flash of a look that is not theirs.
 */
export function applyLook(look: Look): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (look === 'nuevo') {
    if (root.getAttribute(LOOK_ATTRIBUTE) !== 'nuevo') root.setAttribute(LOOK_ATTRIBUTE, 'nuevo');
  } else if (root.hasAttribute(LOOK_ATTRIBUTE)) {
    root.removeAttribute(LOOK_ATTRIBUTE);
  }
}

/**
 * Who is offered the choice while the redesign is being built: accounts marked as QA tester
 * (`profiles.can_run_qa_tests`, the «Tester QA» switch an admin sets on a user in Usuarios).
 * Everyone else never sees «Apariencia», cannot save a look through the route, and is not
 * shown the new look even if their profile holds the key (`lookOfAccount`): an account that
 * stops being a tester goes back to today's look by itself. When the new look becomes
 * everyone's (the redesign's launch) this rule and the switch go away.
 */
export function mayChooseLook(profile: { can_run_qa_tests?: boolean | null } | null | undefined): boolean {
  return profile?.can_run_qa_tests === true;
}

/** The look an account is shown: its stored choice, and only while it is offered the choice. */
export function lookOfAccount(
  profile: { can_run_qa_tests?: boolean | null; learning_preferences?: unknown } | null | undefined
): Look {
  return mayChooseLook(profile) ? lookFromPreferences(profile?.learning_preferences) : 'clasico';
}

/**
 * Pages the new look never touches (redesign 5a). The attribute sits on `<html>` on every page a
 * signed-in tester opens, also on pages that are not the platform: on these it is absent and
 * `useLook().look` answers today's look. The test of a page: is it drawn inside the platform's frame
 * (`MainLayout`) for a signed-in person? If not, it belongs here. Written as Next's route patterns
 * (the router's `pathname`); a concrete address matches its pattern too (`/noticias/una-nota`).
 */
export const PAGES_WITHOUT_THE_LOOK: ReadonlyArray<string> = [
  // Sign-in family (inventory area 01-acceso): changes at the redesign's launch, not before.
  '/login',
  '/reset-password',
  '/change-password',
  '/pending-approval',
  '/403',
  '/registro',
  '/registro-tractor',
  // The public site (inventory area 20-sitio-publico): it has its own design.
  '/',
  '/programas',
  '/nosotros',
  '/equipo',
  '/privacidad',
  '/noticias',
  '/noticias/[slug]',
  '/pasantias',
  // Public Pasantías pages outside the platform: the roster form a school opens from its link.
  '/pasantias/nomina',
  // Documents for a client: the proposal's web view, a contract's print view, the public quote.
  '/propuesta/[slug]',
  '/contract-print/[id]',
  '/quote/[id]',
  // A public page reached from an e-mail: the unsubscribe confirmation.
  '/notificaciones/baja',
  // Next's error pages.
  '/404',
  '/_error',
];

const routeMatcher = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern
      .split('/')
      .map((part) =>
        /^\[[^\]/]+\]$/.test(part)
          ? `(?:${part.replace(/[[\]]/g, '\\$&')}|[^/]+)`
          : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      )
      .join('/')}$`
  );
const MATCHERS = PAGES_WITHOUT_THE_LOOK.map(routeMatcher);

/**
 * Does the new look apply to this page? `pathname` is the router's (a route pattern) or an address;
 * a query, a hash and a trailing slash are ignored. Pure: safe on the server and in tests.
 */
export function lookAppliesTo(pathname: string | null | undefined): boolean {
  if (typeof pathname !== 'string' || pathname === '') return true;
  let path = pathname.split(/[?#]/)[0] || '/';
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/';
  return !MATCHERS.some((matcher) => matcher.test(path));
}
