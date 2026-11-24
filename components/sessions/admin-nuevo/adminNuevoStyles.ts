/**
 * Shared pieces of the new look of the four admin session screens (redesign 6S, release SC): the
 * breadcrumbs each screen passes to the frame, and a few class strings the views share. Drawn only
 * for an account that chose the new look; today's look never imports these.
 */

/** «Consultorías › Sesiones» (the menu's group and item). */
export const CRUMBS_LIST = [{ label: 'Consultorías' }, { label: 'Sesiones' }];
/** «Sesiones › Detalle de Sesión», «Sesiones» a link to the list (as the create form does). */
export const CRUMBS_DETAIL = [{ label: 'Sesiones', href: '/admin/sessions' }, { label: 'Detalle de Sesión' }];
/** «Consultorías › Aprobaciones». */
export const CRUMBS_APPROVALS = [{ label: 'Consultorías' }, { label: 'Aprobaciones' }];
/** «Consultorías › Clasificar Sesiones». */
export const CRUMBS_BULK_TAG = [{ label: 'Consultorías' }, { label: 'Clasificar Sesiones' }];

/** A section heading inside a screen. */
export const H2 = 'font-mont text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-brand_primary';
/** A small label over a value. */
export const LABEL = 'font-mont text-[0.625rem] font-bold uppercase tracking-[0.14em] text-gray-600';
/**
 * On a phone a control a person presses to act is 44 px high. The kit's buttons and fields set a
 * minimum height of 40 px in the new look and no height, so a height on a phone does not fight them.
 */
export const TOUCH = 'max-sm:h-11';
/**
 * For a button whose words may not fit a phone's width: on a phone its words wrap, and they sit in a
 * span (`TOUCH_TEXT`) at least 30 px high, which with the kit's own padding and edge makes the button
 * at least 44 px high however many lines it takes. Neither touches a property the kit's button sets.
 */
export const WRAP = 'max-sm:whitespace-normal';
export const TOUCH_TEXT = 'inline-flex items-center text-center max-sm:min-h-[30px]';
/** The page's body box. */
export const PAGE = 'mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-8 sm:px-6 lg:px-8';
