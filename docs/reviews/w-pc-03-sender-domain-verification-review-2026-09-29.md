# W-PC-03 sender-domain check — independent acceptance

Date: 2026-09-29. Reviewer: SM-31 Codex PM. Accepted result: Brent's dated read of Vercel Production showed `Genera <notificaciones@nuevaeducacion.org>`, and his read of the Resend `nuevaeducacion` team showed `nuevaeducacion.org` as Verified. See [the dated result](w-pc-03-sender-domain-verification-2026-09-29.md) and `runs/SM-31/pm-review-r0.md` for the source review, actual chronology, and one-time timing exception.

The configured `fix/sm09-ci` branch incorporates the read plan and result as commits `5494b0e97` and `523f8f5de`. Its ledger-only commit `5a91078fe1540ffbdf37f2c94d161f4f3dbf4df0` records W-PC-03 `done`; the machine and Markdown rows agree on status and empty unit. The machine row records `extra.authorization_status=AUTHORIZED_READ_ONLY` and `extra.execution_owner=Brent` through supported workflow fields. Its EVIDENCE event names Brent, 2026-09-29, the result, the dated result path, and `SWEEP-NONFUNCTIONAL-EMAIL-DELIVERABILITY-INFRA` and `SWEEP-NONFUNCTIONAL-EMAIL-FROM-CONTRACT`. See `runs/SM-31/pm-review-r1.md` for D1–D5 review and gate results.

This check does not establish SPF/DKIM/DMARC details, a successful provider send, delivery to institutional inboxes, or Engineering sign-off. It does not activate NOTIF N5-07. The separate W-B3c-01 actual-target release gate remains open.
