/**
 * The class strings of the two meeting pages (`/meet/diag`, `/meet/session/[id]`) in the new look
 * (redesign 6S, release SC). These pages have no frame and keep their structure: each element keeps its
 * place and its attributes, and only its classes are chosen by the look (`useLook()` in the page). On the
 * server and at the first paint the look is always today's, so today's strings, written in the pages,
 * are what the server sends. The values copy the kit's new look (card, eyebrow, title, notice, buttons,
 * fields, state words), written plainly because they are only ever applied under the new look; buttons
 * and the links a person presses are at least 44 px high.
 */

/** Shared by both pages. */
export const MEET_NUEVO = {
  main: 'min-h-screen bg-gray-100 px-4 py-10',
  card: 'rounded-lg border border-brand_primary/[0.12] bg-white p-6 sm:p-8',
  eyebrow:
    "flex items-center gap-[0.9em] font-mont text-[0.6875rem] font-medium uppercase leading-[1.6] tracking-[0.26em] text-gray-600 before:h-px before:w-[2.4em] before:flex-none before:bg-current before:opacity-70 before:content-['']",
  title: 'mt-2 break-words text-[1.625rem] font-extrabold leading-tight text-brand_primary',
  sectionTitle: 'font-mont text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-brand_primary',
  text: 'text-[0.8125rem] text-gray-600',
  note: 'text-xs text-gray-600',
  notice:
    'rounded border border-l-4 border-brand_primary/20 border-l-brand_primary bg-brand_primary/5 px-[14px] py-3 text-[0.8125rem] text-brand_primary',
  buttonDefault:
    'inline-flex min-h-[44px] items-center justify-center gap-[0.7em] whitespace-normal rounded-full border border-transparent bg-brand_primary px-[1.5em] py-[0.6em] text-center font-mont text-[0.6875rem] font-bold uppercase leading-[1.2] tracking-[0.14em] text-white no-underline transition-colors duration-150 hover:bg-brand_gray_dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:flex-none',
  buttonOutline:
    'inline-flex min-h-[44px] items-center justify-center gap-[0.7em] whitespace-normal rounded-full border border-brand_primary/50 bg-transparent px-[1.5em] py-[0.6em] text-center font-mont text-[0.6875rem] font-bold uppercase leading-[1.2] tracking-[0.14em] text-brand_primary no-underline transition-colors duration-150 hover:border-brand_primary hover:bg-brand_primary/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
  backLink:
    'inline-flex min-h-[44px] items-center text-[0.8125rem] font-bold text-brand_primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent',
  rule: 'border-t border-brand_primary/[0.12]',
};

/** `/meet/session/[id]`. */
export const MEET_SESSION_NUEVO = {
  details: 'mt-5 space-y-3 text-[0.8125rem] text-brand_primary',
  icon: 'h-4 w-4 flex-shrink-0 text-gray-600',
  chile: 'text-gray-600',
  notice: `mt-6 ${MEET_NUEVO.notice}`,
  joinLink: `w-full ${MEET_NUEVO.buttonDefault}`,
  footer: `mt-6 pt-4 ${MEET_NUEVO.rule}`,
};

/** `/meet/diag`: the states of a measurement, as the kit's state words. */
export const DIAG_STATUS_NUEVO: Record<'pass' | 'warn' | 'fail' | 'info' | 'pending', string> = {
  pass: 'bg-green-100 text-green-600',
  warn: 'bg-amber-100 text-amber-700',
  fail: 'bg-red-100 text-red-600',
  info: 'bg-gray-100 text-gray-600',
  pending: 'bg-gray-100 text-gray-600',
};

export const MEET_DIAG_NUEVO = {
  card: `mt-5 ${MEET_NUEVO.card}`,
  cardDashed: 'mt-5 rounded-lg border border-dashed border-brand_primary/30 bg-white p-6 sm:p-8',
  summary: 'text-xs text-gray-600',
  table: 'w-full min-w-[32rem] text-left text-[0.8125rem] text-brand_primary',
  headRow: 'border-b border-brand_primary/[0.12] bg-gray-100',
  headCell: 'whitespace-nowrap px-[14px] py-[10px] font-mont text-[0.625rem] font-bold uppercase tracking-[0.14em] text-gray-600',
  row: 'border-b border-brand_primary/[0.12] align-top',
  rowHead: 'px-[14px] py-3 font-bold text-brand_primary',
  cell: 'px-[14px] py-3 text-brand_primary',
  cellNote: 'mt-1 block text-xs text-gray-600',
  statusCell: 'px-[14px] py-3',
  status:
    'inline-block whitespace-nowrap rounded-sm px-[0.8em] py-[0.5em] font-mont text-[0.625rem] font-bold uppercase leading-none tracking-[0.12em]',
  measuring: 'px-[14px] py-4 text-[0.8125rem] text-gray-600',
  field: 'block text-[0.8125rem]',
  fieldLabel: 'font-bold text-brand_primary',
  input:
    'mt-1 block min-h-[44px] w-full rounded border border-brand_gray_medium bg-white px-[0.75em] py-[0.5em] leading-[1.4] text-brand_primary placeholder:text-gray-600 hover:border-brand_primary focus:border-brand_primary focus:outline-none focus:ring-2 focus:ring-brand_accent',
  copyOk: 'text-[0.8125rem] text-green-600',
  copyError: 'text-[0.8125rem] text-amber-700',
  report:
    'mt-4 w-full rounded border border-brand_primary/[0.12] bg-gray-100 p-3 font-mono text-xs text-brand_primary',
};
