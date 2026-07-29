import type { NextApiRequest, NextApiResponse } from 'next';
import { createHmac } from 'crypto';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

/**
 * Meeting SDK signature for the /meet/diag test-join probe (Z0B-2, spike).
 *
 * This exists because a Component View join cannot happen without a server-signed
 * JWT, and the field instrument on /meet/diag has to perform a real join to be
 * worth anything. It is deliberately the narrowest thing that can do that job:
 *
 *  - The SDK client SECRET never leaves the server (plan §5 secrets inventory).
 *  - `role` is decided HERE and hardcoded to 0 (participant). A client-supplied
 *    role is ignored — §5: "role decided server-side (client-supplied role
 *    ignored)". This endpoint can therefore never mint host credentials, and it
 *    never touches ZAK.
 *  - Without the SDK env pair configured it answers 404, so on any deployment
 *    that has not been given Zoom credentials the route does not exist as far as
 *    a caller can tell.
 *  - Session presence required — the same bar `/meet/*` middleware and the diag
 *    page itself already enforce. There is no meeting to authorize against: the
 *    tester types a meeting number by hand, and the meeting is a synthetic spike
 *    meeting. Real per-meeting join authorization is `authorizeMeetingJoin()` in
 *    Z2, on the real join endpoint — NOT this probe.
 *
 * Scope note for the reviewer: this is a spike instrument, not the Z3 embed path.
 * Z3 replaces it with the real join API that returns an authorized join payload.
 */

/** §20: exp must be ≥ iat+1800s and ≤ 48h; tokenExp must match exp. */
const SIGNATURE_TTL_SECONDS = 1800;

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

  // Feature absent → route absent. Keeps the page working (it renders the
  // placeholder) on any environment without Zoom credentials.
  if (!sdkKey || !sdkSecret) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const rawMeetingNumber = (req.body as { meetingNumber?: unknown } | undefined)?.meetingNumber;
  const meetingNumber = String(rawMeetingNumber ?? '').replace(/\D/g, '');
  // Zoom meeting ids are 9–11 digits.
  if (meetingNumber.length < 9 || meetingNumber.length > 11) {
    return res.status(400).json({ error: 'Número de reunión inválido.' });
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
  const signature = base64url(createHmac('sha256', sdkSecret).update(unsigned).digest());

  return res.status(200).json({ signature: `${unsigned}.${signature}`, sdkKey });
}
