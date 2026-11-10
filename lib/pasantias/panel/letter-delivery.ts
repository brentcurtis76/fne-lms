/**
 * SERVER ONLY. Building one traveller's Carta de Invitación and emailing it.
 *
 * Three callers share this module so the letter is built one way only: the
 * admin's "generate" button, the admin's "send now" button, and the daily job
 * that emails each letter seven days before the traveller leaves Santiago.
 *
 * Emailing order: claim → build → deliver → keep a copy → record. The copy is
 * stored only after the provider accepted the message, so a failed attempt
 * leaves no stray letter behind and the next run starts clean.
 *
 * Logging (Ley 21.719): codes only. Never a name, an address or the letter.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeUserEmail, PUBLIC_OUTBOUND_EMAIL, type OutboundEmailAuthorization } from '../../email/outbound-policy';
import { deliverOutboundEmail, type EmailTransport } from '../../email/provider';
import { programById } from '../cohort-public';
import { logIntakeFailure } from '../participants/server';
import { readLetterAsset, storeDocument } from './documents';
import { letterDateRange, letterFileName, renderInvitationLetter } from './letter';
import { claimLetterSend, finishLetterSend, loadParticipant } from './server';
import { letterMissing, type LetterSendError, type PanelDocument, type PanelRoster, type PanelRow } from './types';

type Service = SupabaseClient;

export type BuiltLetter =
  | { ok: true; pdf: Buffer; fileName: string; fullName: string }
  | { ok: false; reason: 'incomplete'; missing: string[] }
  | { ok: false; reason: 'render_failed'; error: unknown };

/** The PDF of one traveller's letter, or what is still missing. Never a guessed value. */
export async function buildLetter(supabase: Service, row: PanelRow, roster: PanelRoster): Promise<BuiltLetter> {
  const [logo, signature] = await Promise.all([
    readLetterAsset(supabase, 'logo'),
    readLetterAsset(supabase, 'signature'),
  ]);
  const missing = letterMissing(row.logistics, roster.details, { logo: logo !== null, signature: signature !== null });
  if (missing.length > 0 || !logo || !signature) return { ok: false, reason: 'incomplete', missing };

  const fullName = `${row.participant.firstNames} ${row.participant.lastNames}`;
  try {
    const pdf = await renderInvitationLetter({
      salutation: row.logistics.salutation,
      fullName,
      schoolLine: roster.details.letterSchoolLine,
      lodgingLine: roster.details.letterLodgingLine,
      program: roster.program,
      logo,
      signature,
    });
    return { ok: true, pdf, fileName: letterFileName(fullName), fullName };
  } catch (error) {
    return { ok: false, reason: 'render_failed', error };
  }
}

export type StoredLetter =
  | { ok: true; document: PanelDocument; activityLogged: boolean }
  | { ok: false; stage: 'upload' | 'row'; error: unknown };

/** Keeps a built letter with the traveller's documents. `actorId` null = the automatic send. */
export function storeLetter(
  supabase: Service,
  participantId: string,
  letter: { pdf: Buffer; fileName: string },
  actorId: string | null
): Promise<StoredLetter> {
  return storeDocument(supabase, {
    participantId,
    kind: 'invitation_letter',
    description: null,
    fileName: letter.fileName,
    mimeType: 'application/pdf',
    buffer: letter.pdf,
    actorId,
    action: 'letter_generated',
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface LetterEmailText {
  subject: string;
  text: string;
  html: string;
}

/** The message that carries the letter. Pure — unit tested. */
export function letterEmail(input: {
  firstNames: string;
  roster: Pick<PanelRoster, 'program' | 'programName'>;
  /** The traveller's own page, when their email belongs to a GENERA account. */
  accountUrl: string | null;
}): LetterEmailText {
  const range = letterDateRange(input.roster.program);
  const lines = [
    `Hola ${input.firstNames}:`,
    `Adjuntamos tu carta de invitación a la ${input.roster.programName} en Barcelona, que se realizará ${range}.`,
    'Te recomendamos llevarla impresa o guardada en tu teléfono durante el viaje: pueden pedírtela en el control de ingreso a España.',
  ];
  if (input.accountUrl) {
    lines.push(`También puedes ver la información de tu viaje y descargar tus documentos en GENERA: ${input.accountUrl}`);
  }
  lines.push('Si algún dato de la carta no es correcto, responde a quien coordina la pasantía en tu colegio.');
  lines.push('Fundación Nueva Educación');
  return {
    subject: `Tu carta de invitación — ${input.roster.programName}, Barcelona`,
    text: lines.join('\n\n'),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n'),
  };
}

/** The GENERA account whose profile email is this address (compared without case), or null. */
export async function findAccountByEmail(
  supabase: Service,
  email: string
): Promise<{ ok: true; userId: string | null } | { ok: false; error: unknown }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', email.replace(/[\\%_]/g, (character) => `\\${character}`))
    .order('id', { ascending: true })
    .limit(1);
  if (error) return { ok: false, error };
  const first = ((data ?? []) as unknown as { id?: unknown }[])[0];
  return { ok: true, userId: typeof first?.id === 'string' ? first.id : null };
}

export type LetterSendResult =
  | { status: 'sent'; to: string; stored: boolean }
  | { status: 'skipped'; reason: 'already_sent' | 'in_progress' }
  | { status: 'failed'; error: LetterSendError; missing?: string[] }
  | { status: 'not_found' }
  | { status: 'error' };

export interface SendLetterOptions {
  /** The admin who pressed "send now"; null for the automatic send. */
  actorId: string | null;
  /** An admin's send: goes out even when a letter was already emailed. */
  force: boolean;
  /** Absolute origin of the app, for the link to "Mi pasantía". */
  baseUrl: string | null;
  transport?: EmailTransport;
}

/** Emails one traveller's letter and records how it went. */
export async function sendLetter(
  supabase: Service,
  participantId: string,
  options: SendLetterOptions
): Promise<LetterSendResult> {
  const found = await loadParticipant(supabase, participantId);
  if (found.ok === false) {
    logIntakeFailure('letter send participant read failed', found.error);
    return { status: 'error' };
  }
  if (!found.value) return { status: 'not_found' };
  const { row, roster } = found.value;

  const claim = await claimLetterSend(supabase, participantId, options.force);
  if (claim.ok === false) {
    logIntakeFailure('letter send claim failed', claim.error);
    return { status: 'error' };
  }
  if (!claim.value) {
    return { status: 'skipped', reason: row.logistics.letterSentAt && !options.force ? 'already_sent' : 'in_progress' };
  }

  const fail = async (error: LetterSendError, missing?: string[]): Promise<LetterSendResult> => {
    const recorded = await finishLetterSend(supabase, participantId, { sent: false, error }, options.actorId);
    if (!recorded.ok) logIntakeFailure('letter send outcome not recorded', recorded.error);
    return missing ? { status: 'failed', error, missing } : { status: 'failed', error };
  };

  const email = row.participant.email;
  if (!email) return fail('missing_email');

  const letter = await buildLetter(supabase, row, roster);
  if (letter.ok === false) {
    if (letter.reason === 'incomplete') return fail('missing_data', letter.missing);
    logIntakeFailure('letter send render failed', letter.error);
    return fail('render_failed');
  }

  const account = await findAccountByEmail(supabase, email);
  if (account.ok === false) {
    logIntakeFailure('letter send account lookup failed', account.error);
    return fail('email_failed');
  }
  // A traveller with an account follows that account's school rules (a QA
  // school never receives real mail); anyone else is a public recipient.
  const authorization: OutboundEmailAuthorization = account.userId
    ? await authorizeUserEmail(supabase, account.userId)
    : PUBLIC_OUTBOUND_EMAIL;

  const message = letterEmail({
    firstNames: row.participant.firstNames,
    roster,
    accountUrl: account.userId && options.baseUrl ? `${options.baseUrl}/profile/pasantia` : null,
  });
  const delivery = await deliverOutboundEmail({
    authorization,
    message: {
      to: email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: [{ filename: letter.fileName, content: letter.pdf.toString('base64') }],
    },
    transport: options.transport,
  });
  if (delivery.status !== 'provider_accepted') {
    // The provider's own text is not logged: it can quote the address.
    console.error('[pasantias-intake] letter email not accepted:', { status: delivery.status });
    if (delivery.status === 'not_configured') return fail('email_not_configured');
    if (delivery.status === 'suppressed_qa') return fail('email_suppressed');
    if (delivery.status === 'transport_error') return fail('email_failed');
    return fail('email_rejected');
  }

  const stored = await storeLetter(supabase, participantId, letter, options.actorId);
  if (stored.ok === false) logIntakeFailure(`letter send copy not stored (${stored.stage})`, stored.error);

  // The message is out. If recording that fails, the next daily run would send it again,
  // so the record is tried three times before giving up.
  let recorded = await finishLetterSend(supabase, participantId, { sent: true, email }, options.actorId);
  for (let attempt = 1; !recorded.ok && attempt < 3; attempt += 1) {
    recorded = await finishLetterSend(supabase, participantId, { sent: true, email }, options.actorId);
  }
  if (!recorded.ok) logIntakeFailure('letter send outcome not recorded', recorded.error);
  return { status: 'sent', to: email, stored: stored.ok };
}

/** `programById(...).endDate` plus one calendar month — the day stored files and history go. */
export function retentionDate(program: PanelRoster['program']): string {
  const [year, month, day] = programById(program).endDate.split('-').map(Number);
  // Day 0 of the month after next = the last day of next month: 29 Jan → 28 Feb, as Postgres does.
  const lastOfNext = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, month, Math.min(day, lastOfNext)));
  return date.toISOString().slice(0, 10);
}

/* ------------------------------------------------------- telling the admins */

/** One traveller whose letter is due (or nearly) and has not gone out, and why. */
export interface LetterAttention {
  fullName: string;
  schoolName: string;
  reason: string;
}

/** The message that tells FNE's admins which letters did not go out. Pure — unit tested. */
export function attentionEmail(items: readonly LetterAttention[], panelUrl: string | null): LetterEmailText {
  const count = items.length;
  const subject =
    count === 1
      ? 'Pasantías: 1 carta de invitación sin enviar'
      : `Pasantías: ${count} cartas de invitación sin enviar`;
  const lines = [
    count === 1
      ? 'La carta de invitación de esta persona debería salir en estos días y no se ha enviado:'
      : 'Las cartas de invitación de estas personas deberían salir en estos días y no se han enviado:',
    ...items.map((item) => `• ${item.fullName} (${item.schoolName}): ${item.reason}.`),
    panelUrl
      ? `Completa lo que falta en el Panel de pasantías y la carta saldrá en el próximo envío diario, o envíala desde allí: ${panelUrl}`
      : 'Completa lo que falta en el Panel de pasantías y la carta saldrá en el próximo envío diario.',
    'Este aviso se repite cada día mientras haya cartas pendientes.',
  ];
  return {
    subject,
    text: lines.join('\n\n'),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n'),
  };
}

/**
 * Emails every active global admin the list of letters that did not go out.
 * Each admin's message follows that admin's own school rules (a QA school
 * receives nothing). Returns how many messages the provider accepted.
 */
export async function alertAdmins(
  supabase: Service,
  items: readonly LetterAttention[],
  baseUrl: string | null,
  transport?: EmailTransport
): Promise<{ ok: true; sent: number } | { ok: false; error: unknown }> {
  if (items.length === 0) return { ok: true, sent: 0 };
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role_type', 'admin')
    .eq('is_active', true)
    .limit(200);
  if (rolesError) return { ok: false, error: rolesError };
  const adminIds = Array.from(
    new Set(((roles ?? []) as unknown as { user_id?: unknown }[]).map((row) => row.user_id).filter((id): id is string => typeof id === 'string'))
  );
  if (adminIds.length === 0) return { ok: true, sent: 0 };
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, email').in('id', adminIds);
  if (profilesError) return { ok: false, error: profilesError };

  const message = attentionEmail(items, baseUrl ? `${baseUrl}/admin/pasantias-panel` : null);
  let sent = 0;
  for (const profile of (profiles ?? []) as unknown as { id?: unknown; email?: unknown }[]) {
    if (typeof profile.id !== 'string' || typeof profile.email !== 'string' || !profile.email.includes('@')) continue;
    const delivery = await deliverOutboundEmail({
      authorization: await authorizeUserEmail(supabase, profile.id),
      message: { to: profile.email, subject: message.subject, text: message.text, html: message.html },
      transport,
    });
    if (delivery.status === 'provider_accepted') sent += 1;
    else console.error('[pasantias-intake] letter alert not accepted:', { status: delivery.status });
  }
  return { ok: true, sent };
}
