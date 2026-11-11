/**
 * Bot screening for the public, unauthenticated forms (homepage contact,
 * Pasantías interest, the two signup forms).
 *
 * Written against a concrete pattern: 23 bot submissions in 60 days on the
 * homepage contact form, one at a time and hours apart (so the per-IP rate
 * limit never fired), every one with random mixed-case letters as name and
 * institution and a Gmail address with scattered dots.
 *
 * The rule of the house is that a real message is rare and valuable, so this
 * module never decides on a single clue:
 *
 *   - `blocked`  two independent strong clues, or one strong and one weak.
 *                The route refuses the submission with a visible error that
 *                names another way to reach FNE. Never a fake success: a
 *                person wrongly caught must be able to tell.
 *   - `flagged`  one strong clue (or two weak ones). Delivered as usual, with
 *                `SPAM_SUBJECT_TAG` in the subject and the reasons in the body.
 *   - `clean`    everything else, including one weak clue on its own.
 *
 * Pure: no I/O, no database, no outside service. Safe to import anywhere.
 */

/** Below this, between the form appearing and being sent, nobody typed it. */
export const MIN_HUMAN_FILL_MS = 3000;

/** Prefix for the subject of a delivered-but-doubtful message. */
export const SPAM_SUBJECT_TAG = '[POSIBLE SPAM]';

const STRONG = 2;
const WEAK = 1;
const BLOCK_AT = 3;
const FLAG_AT = 2;

export type SpamSignal = 'honeypot' | 'too_fast' | 'random_text' | 'no_timing' | 'gmail_dots';

export interface SpamReason {
  signal: SpamSignal;
  points: number;
  /** es-CL, for the person reading the notification email. */
  detail: string;
}

export type SpamVerdict = 'clean' | 'flagged' | 'blocked';

export interface SpamAssessment {
  verdict: SpamVerdict;
  score: number;
  reasons: SpamReason[];
}

export interface SpamTextField {
  /** es-CL field name as the form shows it, e.g. `Nombre`. */
  label: string;
  value: unknown;
  /**
   * Free prose (a message box). Only counted when the WHOLE value is random
   * letters: a real message may legitimately contain one odd token, such as
   * the ID inside a pasted document link.
   */
  freeText?: boolean;
}

export interface SpamCheckInput {
  /** The hidden trap field's value. Omit when the route handles it itself. */
  honeypot?: unknown;
  /** Milliseconds between the form mounting and its submission, browser-reported. */
  elapsedMs?: unknown;
  /**
   * Whether this form's current page sends `elapsedMs`. When true, its absence
   * is a weak clue (a direct POST that never loaded the page). It stays weak
   * because a page cached from before this shipped does not send it either.
   */
  expectTiming?: boolean;
  email?: unknown;
  textFields?: SpamTextField[];
}

const VOWELS = new Set('aeiouyáéíóúüàèìòùâêîôûäëïö');

// Explicit Latin ranges rather than `\p{L}`, as lib/pasantias/participants/
// validation.ts does: Unicode property escapes are missing on the older
// browsers school hardware still runs, and this module must stay importable
// from a page. Other scripts are simply never judged.
const LETTER = 'A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F\\u1E00-\\u1EFF';
const EDGE_NON_LETTERS = new RegExp(`^[^${LETTER}]+|[^${LETTER}]+$`, 'g');
const LETTERS_ONLY = new RegExp(`^[${LETTER}]+$`);

const MIN_RANDOM_TOKEN_LENGTH = 10;

/**
 * One whitespace-separated word, judged on two independent properties that a
 * random draw from `A–Z a–z` has and a typed word does not:
 *
 *   casing   capitals scattered mid-word. A "hump" is a lowercase letter
 *            directly followed by a capital: `Fernández` has none, `McDonald`
 *            one, `DeLaFuente` two; a random 23-letter string averages five.
 *   sound    no vowel rhythm: a long run of consonants, or few vowels overall.
 *
 * Requiring both keeps run-together names (`ColegioSanJoseDeLaSalle`: many
 * humps, perfectly pronounceable) and consonant-heavy surnames
 * (`Schwarzenegger`, `Brzęczyszczykiewicz`: no humps) out. Only Latin letters
 * are judged; a name in any other script never matches.
 */
function isRandomLetterToken(rawToken: string): boolean {
  // Edge punctuation only ("Pérez," / "(UTEM)"); anything else inside the
  // word — digits, dots, hyphens — and it is not the pattern this targets.
  const token = rawToken.replace(EDGE_NON_LETTERS, '');
  if (token.length < MIN_RANDOM_TOKEN_LENGTH || !LETTERS_ONLY.test(token)) {
    return false;
  }

  let humps = 0;
  let vowels = 0;
  let consonantRun = 0;
  let longestConsonantRun = 0;
  let previousWasLower = false;

  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];
    const lower = char.toLowerCase();
    const isUpper = char !== lower;
    const isLower = !isUpper && char !== char.toUpperCase();

    if (isUpper && previousWasLower) humps += 1;
    previousWasLower = isLower;

    if (VOWELS.has(lower)) {
      vowels += 1;
      consonantRun = 0;
    } else {
      consonantRun += 1;
      if (consonantRun > longestConsonantRun) longestConsonantRun = consonantRun;
    }
  }

  const vowelRatio = vowels / token.length;

  // Thresholds chosen by simulation: ~98% of uniform random 23-letter strings
  // match, none of a list of Chilean, German, Polish and run-together
  // institution names does (see __tests__/lib/formSpamGuard.test.ts).
  if (humps >= 2 && (longestConsonantRun >= 5 || vowelRatio < 0.3)) return true;
  if (humps >= 4 && (longestConsonantRun >= 4 || vowelRatio < 0.36)) return true;
  return false;
}

/**
 * Whether a field holds random letters.
 *
 * `any` (names, institutions): one random word is enough. `all` (free prose):
 * every word must be random, so a real sentence is never judged by one token.
 */
export function looksLikeRandomLetters(value: unknown, mode: 'any' | 'all' = 'any'): boolean {
  if (typeof value !== 'string') return false;
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return mode === 'all' ? tokens.every(isRandomLetterToken) : tokens.some(isRandomLetterToken);
}

/**
 * A Gmail address with three or more dots before the `@`.
 *
 * Gmail ignores dots, so one mailbox yields unlimited "different" addresses —
 * which is what the observed bots send. Weak on its own: real people do write
 * `nombre.segundo.apellido@gmail.com`, though rarely with a third dot.
 */
export function hasGmailDotPattern(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const match = /^([^@\s]+)@(gmail|googlemail)\.com$/i.exec(email.trim());
  if (!match) return false;
  const local = match[1].split('+')[0];
  return local.split('.').length - 1 >= 3;
}

/** A usable elapsed time, or null when absent or not a sane number. */
function parseElapsedMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function assessFormSubmission(input: SpamCheckInput): SpamAssessment {
  const reasons: SpamReason[] = [];

  if (typeof input.honeypot === 'string' && input.honeypot.trim().length > 0) {
    reasons.push({
      signal: 'honeypot',
      points: STRONG,
      detail: 'Se completó un campo oculto que las personas no ven.',
    });
  }

  const elapsedMs = parseElapsedMs(input.elapsedMs);
  if (elapsedMs !== null && elapsedMs < MIN_HUMAN_FILL_MS) {
    reasons.push({
      signal: 'too_fast',
      points: STRONG,
      detail: `El formulario se envió en menos de ${MIN_HUMAN_FILL_MS / 1000} segundos.`,
    });
  } else if (elapsedMs === null && input.expectTiming) {
    reasons.push({
      signal: 'no_timing',
      points: WEAK,
      detail: 'El envío llegó sin la marca de tiempo que agrega el formulario de la página.',
    });
  }

  for (const field of input.textFields ?? []) {
    if (looksLikeRandomLetters(field.value, field.freeText ? 'all' : 'any')) {
      reasons.push({
        signal: 'random_text',
        points: STRONG,
        detail: `El campo «${field.label}» parece letras al azar.`,
      });
    }
  }

  if (hasGmailDotPattern(input.email)) {
    reasons.push({
      signal: 'gmail_dots',
      points: WEAK,
      detail: 'El correo es de Gmail y tiene tres o más puntos antes de la arroba.',
    });
  }

  const score = reasons.reduce((total, reason) => total + reason.points, 0);
  const verdict: SpamVerdict = score >= BLOCK_AT ? 'blocked' : score >= FLAG_AT ? 'flagged' : 'clean';

  return { verdict, score, reasons };
}
