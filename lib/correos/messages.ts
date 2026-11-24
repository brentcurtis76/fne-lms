/**
 * Plain Spanish for everything the database can answer. A raw database error is never shown: an unknown one
 * becomes `GENERIC_FAILURE`.
 */

export const GENERIC_FAILURE = 'Algo falló al guardar. No se cambió nada. Inténtalo de nuevo en un momento.';

/** The codes `email_add_contacts` and `email_erase_contact` raise (message `<function>: <code>`). */
export const DATABASE_CODE_MESSAGES: Record<string, string> = {
  rows_not_array: 'No había personas que agregar.',
  too_many_rows: 'Son más de 20.000 personas de una vez. No se agregó nada: divide la lista en partes más pequeñas.',
  lists_required: 'Elige al menos una lista.',
  list_not_found_or_archived: 'Una de las listas elegidas ya no existe o está archivada. Vuelve a cargar la página y elige otra.',
  source_invalid: 'No se pudo registrar cómo llegaron estas personas. No se agregó nada.',
  legal_basis_invalid: 'Elige de dónde viene el permiso para escribirles.',
  basis_note_required: 'Escribe una nota sobre el permiso: cómo y cuándo lo dieron.',
  basis_recorded_at_required: 'Falta la fecha del permiso. No se agregó nada.',
  consent_notice_version_required: 'Indica la versión del aviso de privacidad que aceptaron en el formulario.',
  actor_required: 'No pudimos saber quién hace el cambio. Vuelve a iniciar sesión.',
  contact_not_found: 'No encontramos a esa persona. Puede que ya no exista.',
};

/** The code inside a database error, or null. */
export function databaseCode(error: unknown): string | null {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
  const match = /email_(?:add_contacts|erase_contact): ([a-z_]+)/.exec(message);
  return match ? match[1] : null;
}

/** The plain message for a database error. */
export function databaseErrorMessage(error: unknown): string {
  const code = databaseCode(error);
  return (code && DATABASE_CODE_MESSAGES[code]) || GENERIC_FAILURE;
}

/** Whether a database error is a unique-key clash (Postgres 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === '23505');
}

export const LIST_MESSAGES = {
  nameRequired: 'Escribe un nombre para la lista.',
  nameTooLong: 'El nombre puede tener hasta 200 caracteres.',
  nameTaken: 'Ya existe una lista con ese nombre (sin contar mayúsculas ni espacios). Elige otro.',
  descriptionTooLong: 'La descripción puede tener hasta 1000 caracteres.',
  publicFlag: 'Indica si la lista es pública o no.',
  notFound: 'No encontramos esa lista.',
  nothingToChange: 'No hay nada que cambiar.',
  archived: 'Esa lista está archivada y ya no se puede cambiar.',
} as const;

export const CONTACT_MESSAGES = {
  addressInvalid: 'Esa dirección de correo no es válida. Revísala: debe tener una arroba (@) y un dominio, como «.cl».',
  listsRequired: 'Elige al menos una lista.',
  nameTooLong: 'Los nombres y la organización pueden tener hasta 200 caracteres cada uno.',
  added: 'Listo: la persona quedó suscrita a las listas elegidas.',
  alreadyThere: 'Esta persona ya estaba en todas esas listas. No cambió nada.',
  blocked: 'Esta dirección está bloqueada y no se puede agregar.',
  left: 'Esta persona se dio de baja por decisión propia. No se volvió a agregar.',
  notFound: 'No encontramos a esa persona.',
  erased: 'Listo: se borraron los datos de esta persona. Queda bloqueada para siempre.',
  alreadyErased: 'Esta persona ya estaba borrada. No cambió nada.',
} as const;
