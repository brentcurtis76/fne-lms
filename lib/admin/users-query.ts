// PostgREST `in`/`not.in` filters expect a parenthesized list. Quoting each
// value is the documented-safe form: it survives values that contain commas,
// parens, or quotes — even though the values we currently pass (UUIDs, role
// type identifiers) never do. supabase-js's `.not()` is pure string interp,
// so the typed array form is not available here. Embedded `\` and `"` are
// escaped defensively so a future caller passing arbitrary strings can't
// break out of the quoted value.
export const toQuotedInList = (values: readonly string[]): string =>
  `(${values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
