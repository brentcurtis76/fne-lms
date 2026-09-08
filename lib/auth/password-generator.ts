/**
 * Cryptographically secure password generation.
 *
 * What this replaces: every generator in the codebase drew from `Math.random()`
 * — a seeded, non-cryptographic PRNG whose internal state is recoverable from a
 * handful of outputs. Three of them mattered:
 *
 *   - `utils/passwordGenerator.generatePassword`, the source of the temporary
 *     password behind every provisioned account,
 *   - `utils/bulkUserParser`, which filled a missing CSV password with
 *     `Math.random().toString(36).slice(-8)` — base-36 digits and lowercase
 *     letters only, so the result could not contain an uppercase character and
 *     therefore FAILED the policy on every single row,
 *   - `components/PasswordResetModal.generateRandomPassword`, in the browser.
 *
 * Two properties this module holds that the old code did not:
 *
 *   1. Every byte comes from a CSPRNG. There is no `Math.random()` fallback —
 *     if no CSPRNG is reachable the generator throws rather than quietly
 *     producing a guessable credential.
 *   2. Selection is unbiased. Taking `bytes[i] % alphabet.length` skews toward
 *     the first `256 % length` characters; this uses rejection sampling so
 *     every character is equiprobable.
 *
 * Testability without weakening production: `randomBytes` is an injectable
 * boundary, defaulting to the CSPRNG. A test can pass a deterministic source
 * and assert the exact output; production never passes anything, so there is no
 * runtime switch, no environment variable, and no way to reach the weak path
 * from a deployed build.
 */
import { PASSWORD_POLICY, validatePasswordPolicy } from './password-policy';

/** Fills and returns `byteLength` cryptographically random bytes. */
export type RandomBytes = (byteLength: number) => Uint8Array;

/**
 * Ambiguity-free alphabets. `0/O`, `1/l/I` are excluded because these values are
 * read aloud and re-typed from a screen or a printed sheet. The exclusion costs
 * ~0.4 bits per character and buys a materially lower support burden.
 */
const UPPERCASE = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const ALPHABET = UPPERCASE + LOWERCASE + DIGITS;

/**
 * Default generated length. Well above the policy floor of 8: these values are
 * machine-generated and never chosen by a human, so there is no memorability
 * cost to spend. 16 characters over this 57-symbol alphabet is ~93 bits.
 */
export const GENERATED_PASSWORD_LENGTH = 16;

/** Enough headroom that rejection sampling effectively never runs dry. */
const MAX_REJECTION_ROUNDS = 64;

/**
 * The production randomness source: Web Crypto, and nothing else.
 *
 * `globalThis.crypto.getRandomValues` is available everywhere this code runs —
 * every browser the platform supports (it predates the oldest school hardware
 * in the fleet by a decade), Node 19+ (CI pins 22, Vercel serves 24), and the
 * Edge runtime. Using the one API that spans all of them keeps a single code
 * path with no bundler-visible `require`, so no Node polyfill ever reaches a
 * browser chunk.
 *
 * There is deliberately NO fallback. A generator that cannot reach a CSPRNG
 * must not produce a value: a weak credential that looks like a strong one is
 * worse than a failed request, and the failure is loud enough to fix.
 */
export function cryptoRandomBytes(byteLength: number): Uint8Array {
  const webCrypto = globalThis.crypto;

  if (!webCrypto || typeof webCrypto.getRandomValues !== 'function') {
    throw new Error(
      '[password-generator] no cryptographically secure random source is available'
    );
  }

  return webCrypto.getRandomValues(new Uint8Array(byteLength));
}

/**
 * Pulls bytes from `randomBytes` in chunks and hands out uniformly distributed
 * indices into an alphabet of `size` symbols.
 *
 * Exported (via `createIndexSource`) because the unbiasedness is the security
 * property worth testing directly: over a full password the three alphabets and
 * the shuffle mix together, so an aggregate frequency check cannot distinguish
 * rejection sampling from a modulo. Against one alphabet it can, exactly.
 */
export class UnbiasedIndexSource {
  private buffer: Uint8Array = new Uint8Array(0);
  private offset = 0;

  constructor(
    private readonly randomBytes: RandomBytes,
    private readonly chunkSize = 64
  ) {}

  private nextByte(): number {
    if (this.offset >= this.buffer.length) {
      const refilled = this.randomBytes(this.chunkSize);
      if (!refilled || refilled.length === 0) {
        throw new Error('[password-generator] random source returned no bytes');
      }
      this.buffer = refilled;
      this.offset = 0;
    }
    return this.buffer[this.offset++];
  }

  /** A uniform integer in [0, size). Rejects the biased tail of the byte range. */
  next(size: number): number {
    if (!Number.isInteger(size) || size <= 0 || size > 256) {
      throw new Error(`[password-generator] unsupported alphabet size: ${size}`);
    }
    // Largest multiple of `size` that fits in a byte. Values at or above it are
    // discarded — that, not a modulo, is what makes every symbol equiprobable.
    const limit = Math.floor(256 / size) * size;

    for (let round = 0; round < MAX_REJECTION_ROUNDS; round += 1) {
      const byte = this.nextByte();
      if (byte < limit) {
        return byte % size;
      }
    }

    throw new Error(
      '[password-generator] random source exhausted the rejection budget — refusing to bias the draw'
    );
  }
}

/** Test seam for the unbiasedness property. Production uses it internally. */
export function createIndexSource(randomBytes: RandomBytes, chunkSize?: number) {
  return new UnbiasedIndexSource(randomBytes, chunkSize);
}

export interface GeneratePasswordOptions {
  /** Defaults to `GENERATED_PASSWORD_LENGTH`; never below the policy minimum. */
  length?: number;
  /** Test seam. Production leaves this unset and gets the CSPRNG. */
  randomBytes?: RandomBytes;
}

/**
 * A password that satisfies the shared policy by construction and is then
 * checked against it anyway.
 *
 * The re-check is not ceremony: it is the assertion that the generator and the
 * validator cannot drift apart. If someone widens the policy without widening
 * the alphabet, this throws at the first call instead of failing one row at a
 * time deep inside a bulk import — which is exactly how the `Math.random()`
 * base-36 defect stayed invisible.
 */
export function generateCompliantPassword(options: GeneratePasswordOptions = {}): string {
  const randomBytes = options.randomBytes ?? cryptoRandomBytes;
  const length = Math.max(options.length ?? GENERATED_PASSWORD_LENGTH, PASSWORD_POLICY.minLength);

  if (length > PASSWORD_POLICY.maxLength) {
    throw new Error(
      `[password-generator] requested length ${length} exceeds the policy maximum of ${PASSWORD_POLICY.maxLength}`
    );
  }

  const source = new UnbiasedIndexSource(randomBytes);
  const pick = (alphabet: string) => alphabet[source.next(alphabet.length)];

  // One guaranteed character per required class, then fill from the union.
  const characters: string[] = [pick(UPPERCASE), pick(LOWERCASE), pick(DIGITS)];
  while (characters.length < length) {
    characters.push(pick(ALPHABET));
  }

  // Fisher–Yates over the same unbiased source, so the guaranteed characters do
  // not sit in fixed positions.
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = source.next(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }

  const password = characters.join('');

  const { valid, errors } = validatePasswordPolicy(password);
  if (!valid) {
    throw new Error(
      `[password-generator] generated a password that violates the shared policy: ${errors.join('; ')}`
    );
  }

  return password;
}

/**
 * `count` distinct passwords. Uniqueness is per batch, which is what a bulk
 * import needs: two people must never be handed the same credential.
 *
 * The attempt budget exists because a caller-supplied deterministic
 * `randomBytes` can legitimately repeat itself; without it a test double would
 * spin forever instead of failing.
 */
export function generateCompliantPasswords(
  count: number,
  options: GeneratePasswordOptions = {}
): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`[password-generator] invalid password count: ${count}`);
  }

  const passwords: string[] = [];
  const seen = new Set<string>();
  const maxAttempts = count * 8 + 16;

  for (let attempt = 0; attempt < maxAttempts && passwords.length < count; attempt += 1) {
    const password = generateCompliantPassword(options);
    if (seen.has(password)) continue;
    seen.add(password);
    passwords.push(password);
  }

  if (passwords.length < count) {
    throw new Error(
      `[password-generator] could not produce ${count} distinct passwords — the random source is repeating`
    );
  }

  return passwords;
}
