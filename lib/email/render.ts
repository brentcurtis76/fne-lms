/**
 * The one HTML shell for Genera's transactional e-mails.
 *
 * `lib/email/notifications.ts` and `lib/email/invitations.ts` each carried a
 * copy of this markup. Both now render through here, so the escaping and the
 * visible fallback URL cannot drift apart.
 *
 * Every value is escaped here, not by the caller: pass raw text. `ctaHref` is
 * escaped for both the attribute and the visible fallback; the two are the same
 * string, so a mail client that renders neither anchors nor styles still shows
 * a usable URL.
 *
 * Browser-reachable through `lib/notificationService.ts`: keep this module free
 * of server-only imports.
 */
import { escapeHtml } from '../utils/html-escape';

export interface EmailContent {
  heading: string;
  /** Body paragraphs above the button, in order. Empty ones are dropped. */
  paragraphs: Array<string | null | undefined>;
  ctaLabel: string;
  ctaHref: string;
  fallbackLead: string;
  closingLine?: string;
  /** A link at the end of the closing note, shown as its own URL: `lead` then `href`. */
  footerLink?: { lead: string; href: string };
}

export function renderEmail(content: EmailContent): string {
  const safeHref = escapeHtml(content.ctaHref);
  const paragraphs = content.paragraphs.map((text) => escapeHtml(text)).filter(Boolean);
  const safeFooterHref = escapeHtml(content.footerLink?.href);
  const safeClosing = [
    escapeHtml(content.closingLine),
    safeFooterHref && `${escapeHtml(content.footerLink?.lead)} <a href="${safeFooterHref}" style="color:#0a0a0a;word-break:break-all;">${safeFooterHref}</a>`,
  ]
    .filter(Boolean)
    .join('<br />');

  return `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#202020;">
          <div style="max-width:620px;margin:0 auto;background:#ffffff;">
            <div style="background:#0a0a0a;color:#ffffff;padding:28px 28px 22px;">
              <div style="color:#fbbf24;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
                Genera
              </div>
              <h1 style="margin:12px 0 0;font-size:26px;line-height:1.25;">
                ${escapeHtml(content.heading)}
              </h1>
            </div>
            <div style="padding:30px 28px;">
              ${paragraphs
                .map((text, index) => {
                  const gap = index === paragraphs.length - 1 ? 20 : 16;
                  return `<p style="margin:0 0 ${gap}px;font-size:16px;line-height:1.6;">${text}</p>`;
                })
                .join('\n              ')}
              <p style="margin:26px 0;text-align:center;">
                <a href="${safeHref}" style="display:inline-block;background:#fbbf24;color:#0a0a0a;text-decoration:none;font-weight:700;border-radius:6px;padding:14px 22px;">
                  ${escapeHtml(content.ctaLabel)}
                </a>
              </p>
              <p style="margin:0 0 8px;color:#666;font-size:13px;line-height:1.6;">
                ${escapeHtml(content.fallbackLead)}
              </p>
              <p style="margin:0;color:#0a0a0a;font-size:13px;line-height:1.6;word-break:break-all;">
                ${safeHref}
              </p>
              ${safeClosing ? `<p style="margin:20px 0 0;color:#666;font-size:13px;line-height:1.6;">${safeClosing}</p>` : ''}
            </div>
          </div>
        </body>
      </html>
    `;
}
