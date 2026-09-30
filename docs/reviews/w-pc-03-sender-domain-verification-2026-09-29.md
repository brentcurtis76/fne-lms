# W-PC-03 sender-domain check — evidence, 2026-09-29

## Result and sources

**Verdict: verified sender domain at the time of Brent's checks.** Vercel Production displayed `EMAIL_FROM_ADDRESS` as `Genera <notificaciones@nuevaeducacion.org>`; the configured sender domain is `nuevaeducacion.org`. Resend's `nuevaeducacion` team displayed that same domain as `Verified`. This verifies the domain status shown in those dashboards. It does not prove email delivery, inbox placement, SPF/DKIM/DMARC details, or an Engineering sign-off.

Brent authorized and performed both read-only dashboard checks himself on 2026-09-29. At approximately 14:55 -03:00, he requested a guided walk-through after being told the separate Vercel sender/deployment and Resend domain-status scopes. His 2026-09-29 follow-up explicitly confirmed his authorization, execution, and acceptance of the committed pre-read packet at `fix/pc03` commit `3a3812b24e0da573b82e0d281d254f9284f52088`. The guided-check record was written at 15:39:32 -03:00; the exact minute of each read was not recorded. Source record and screenshots: `/home/brent/Projects/pm-workflow/runs/SM-30/evidence/w-pc-03-brent-checks-20260929/RECORD.md` and the image files beside it. No hosted setting was changed, no API key was used, and no email was sent.

| Check | Read-only source and screenshot | Observation |
|---|---|---|
| Vercel Production | `fne-lms` project, Environment Variables; `vercel-env-EMAIL_FROM_ADDRESS.png` | `EMAIL_FROM_ADDRESS` is set to the named form `Genera <notificaciones@nuevaeducacion.org>` for Production. No other environment value is part of this evidence. |
| Deployment identity | Same project's Production Overview; `vercel-overview.png` | Ready deployment from `main` at `51ed605cf17c80bc62e654e987983aadea0d5d29` (dashboard abbreviation `51ed605`). |
| Resend domain | `nuevaeducacion` team, Domains page; `resend-domains.png` | `nuevaeducacion.org` shows `Verified`. SPF, DKIM, DMARC, and region were not opened and are **unknown** from this check. |

The first Resend team Brent opened showed no domains; the `Verified` observation belongs specifically to the `nuevaeducacion` team. Both claim IDs are `SWEEP-NONFUNCTIONAL-EMAIL-DELIVERABILITY-INFRA` and `SWEEP-NONFUNCTIONAL-EMAIL-FROM-CONTRACT`.

## Sender behavior supported by the identified code

The six active sender implementations inventoried in `w-pc-03-read-plan-2026-09-28.md` are byte-identical between its inspected source commit `0723d1468faf97e2f1ffa052170061f87827ff9b` and the Production deployment commit `51ed605cf17c80bc62e654e987983aadea0d5d29` (`git diff` on those six paths is empty). This supports applying the documented sender contracts to the identified deployment code. The dashboard check does not establish a successful provider call from any path.

| Input to `EMAIL_FROM_ADDRESS` | `lib/emailService.js` | Five direct sender paths |
|---|---|---|
| Empty or unset | Uses `Genera <notificaciones@fne-lms.com>` | Use `Genera <notificaciones@nuevaeducacion.org>` |
| Valid bare address | Wraps as `Genera <address>` | Pass the configured bare string onward without local sender parsing |
| Valid named address | Passes the configured named string | Pass the configured named string onward |
| Malformed nonempty value, including control characters | Local parser rejects it before provider handoff | No local sender parser or control-character check at these call sites; the provider's response is unobserved |

The observed configured value is a named address at `nuevaeducacion.org`, so it uses the configured-value branch in all six paths. Both fallback domains remain comparison points; `fne-lms.com` was not checked in Resend and its verification status is unknown. The check did not exercise the empty, bare, or malformed branches in Production.

## Process and release limits

The original packet commit preceded the reads, and Brent's dated guided-check authorization preceded them, but the packet's authorization table was filled only afterward. Approved SM plan revision 2 required a committed dated authorization in that packet *before each read*. Brent approved a one-time timing exception for these two completed reads on 2026-09-29 (resolved workflow decision `15bf1e93b10f2866`; `runs/SM-30/TIMING-EXCEPTION-EVIDENCE.md`). The chronology remains visible here; the later amendment is not presented as a pre-read commit. The later Vercel observation that secret variables exist is outside the two sender-domain reads and is not evidence of email delivery.

The W-PC-03 machine row remains `waiting`/`UNAUTHORIZED` until the supported workflow reconciles its authorization and execution-owner fields. W-B3b-02's recorded `done` status still conflicts with its verification and Engineering sign-off exit gate; Brent is the named Engineering signer in the plan, but no signing action is documented here. NOTIF N5-07 may consume this evidence path through its own PM workflow; no Production activation or institutional-mailbox delivery is asserted.
