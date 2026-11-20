/**
 * Send-back B10, point 2: a row of two or three fields of the new form keeps its boxes in line. Each
 * field takes its rows from the row around it (a subgrid): the labels share the first row, the boxes the
 * second, the messages the third; so the boxes start on one line and have one height whatever the length
 * of the labels. The row's own vertical gap is the field's (6 px), so a field's parts keep their spacing.
 *
 * FIELD_ROW goes on the row (with its columns); ROW_FIELD on each field in it. A field that can carry a
 * help text (it comes after the box, before the error) takes ROW_FIELD_WITH_HELP, one row more. A browser
 * without subgrids draws each field as before, one under its label.
 */
export const FIELD_ROW = 'grid gap-x-4 gap-y-[6px]';

const SUBGRID = 'grid-cols-[minmax(0,1fr)] content-start [grid-template-rows:subgrid]';

/** Label, box, error. */
export const ROW_FIELD = `row-span-3 ${SUBGRID}`;

/** Label, box, help, error. */
export const ROW_FIELD_WITH_HELP = `row-span-4 ${SUBGRID}`;
