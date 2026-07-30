import type { NextApiRequest, NextApiResponse } from 'next';
import { createHmac } from 'crypto';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import { diagMeetingAllowlist, isDiagJoinConfigured } from '../../../lib/meet/diag-config';

/**
 * Meeting SDK signature for the /meet/diag test-join probe (Z0B-2, spike).
 *
 * This exists because a Component View join cannot happen without a server-signed
 * JWT, and the field instrument on /meet/diag has to perform a real join to be
 * worth anything.
 *
 * ## Authorization (rewritten in Z0B-2r1 — Sol R1 finding ⑤)
 *
 * The previous version gated on SESSION PRESENCE only, with syntactic validation of
 * the meeting number. Sol's finding, and the PM overturned its own earlier
 * acceptance of it: any authenticated account — every docente, every student
 * account Fase 3 will create — could mint an FNE-signed SDK signature for ANY
 * syntactically valid 9–11 digit meeting number in the account. Syntactic
 * validation is input hygiene; it is not authorization, and the repo's
 * `auth → role → validation → logic` pattern applies to a spike surface that
 * ships just as much as to a production one.
 *
 * Four gates now, in this order:
 *
 *  1. **Configured.** Without the SDK env pair AND a non-empty meeting allowlist the
 *     route answers 404 — the feature does not exist as far as a caller can tell.
 *     Both halves matter: an allowlist that is absent or empty is an unconfigured
 *     endpoint, not an endpoint that signs everything.
 *  2. **Authenticated.** No session → 401.
 *  3. **Role.** `admin` or `consultor` only → otherwise 403. Those are the §17
 *     field-protocol operators: the consultor runs `zoom-hw-protocol.md` on a school
 *     machine, and admin is FNE staff. Nobody else has a reason to sign a join.
 *  4. **Target.** The meeting number must be in `ZOOM_DIAG_MEETING_IDS`. This is the
 *     gate that makes the endpoint bounded rather than merely gated: even a
 *     compromised consultor account can only sign a join to a meeting an operator
 *     deliberately listed in server env.
 *
 * **Allowlist-miss returns 404, not 403** — chosen deliberately. A 403 would answer
 * "does meeting 87239242778 exist in FNE's Zoom account?" for anyone who can reach
 * this route, which is an existence oracle over the account's meeting space, and a
 * meeting number is guessable (9–11 digits, and Zoom's PMIs are shorter still). 404
 * makes an unlisted meeting indistinguishable from an unconfigured endpoint, so the
 * response leaks nothing about what exists. The cost is a slightly worse error
 * message for the operator, which the header comment and the env var name absorb.
 *
 * ## Unchanged, and still load-bearing
 *
 *  - The SDK client SECRET never leaves the server (plan §5 secrets inventory).
 *  - `role` is decided HERE and hardcoded to 0 (participant). A client-supplied role
 *    is ignored — §5: "role decided server-side (client-supplied role ignored)".
 *    This endpoint can therefore never mint host credentials, and it never touches
 *    ZAK.
 *
 * Scope note for the reviewer: this is a spike instrument, not the Z3 embed path.
 * Z3 replaces it with the real join API, whose authorization is
 * `authorizeMeetingJoin()` against a provisioned session (Z2) rather than an env
 * allowlist. The allowlist is right for a probe against hand-typed synthetic spike
 * meetings and would be wrong for the product.
 */

/** §20: exp must be ≥ iat+1800s and ≤ 48h; tokenExp must match exp. */
const SIGNATURE_TTL_SECONDS = 1800;

/** §17 field-protocol operators. Nobody else runs the hardware protocol. */
const ALLOWED_ROLES = ['admin', 'consultor'];

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sdkKey = process.env.ZOOM_SDK_CLIENT_ID;
  const sdkSecret = process.env.ZOOM_SDK_CLIENT_SECRET;

  // Gate 1 — feature absent → route absent.
  if (!isDiagJoinConfigured()) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Gate 2 — authenticated.
  const supabase = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Gate 3 — role.
  const role = await getUserPrimaryRole(session.user.id);
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Validation — hygiene, not authorization. Kept because a malformed body should be
  // a 400 rather than falling through to the allowlist comparison.
  const rawMeetingNumber = (req.body as { meetingNumber?: unknown } | undefined)?.meetingNumber;
  // Type FIRST, then coerce. `String(x)` on a non-scalar runs `toString()`, so a JSON
  // body of `{"meetingNumber": ["<an allowlisted id>"]}` used to coerce cleanly to an
  // allowlisted number and get signed. Only a string or a number is a meeting number.
  if (typeof rawMeetingNumber !== 'string' && typeof rawMeetingNumber !== 'number') {
    return res.status(400).json({ error: 'Número de reunión inválido.' });
  }
  const meetingNumber = String(rawMeetingNumber).replace(/\D/g, '');
  // Zoom meeting ids are 9–11 digits.
  if (meetingNumber.length < 9 || meetingNumber.length > 11) {
    return res.status(400).json({ error: 'Número de reunión inválido.' });
  }

  // Gate 4 — target. 404 rather than 403, so the response is not an existence
  // oracle over FNE's meeting space (see the header comment).
  if (!diagMeetingAllowlist().includes(meetingNumber)) {
    return res.status(404).json({ error: 'Not found' });
  }

  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + SIGNATURE_TTL_SECONDS;

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    appKey: sdkKey,
    sdkKey,
    mn: meetingNumber,
    // Hardcoded — see the header comment. Never read from the request.
    role: 0,
    iat,
    exp,
    tokenExp: exp,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(createHmac('sha256', sdkSecret as string).update(unsigned).digest());

  return res.status(200).json({ signature: `${unsigned}.${signature}`, sdkKey });
}
