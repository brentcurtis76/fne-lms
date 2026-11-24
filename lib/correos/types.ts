/**
 * Correos kit: the shapes shared by every part of the kit and by the host app.
 *
 * The kit is meant to be lifted out and installed in another Next.js + Supabase + Resend app. It imports
 * only installed packages and its own files, names no brand and reads no environment variable. Everything
 * app-specific (who is asking, how a message goes out, the brand itself) comes in through `CorreosHost`.
 */

/** One client's look and identity. One brand file per client, kept by the host app. */
export interface Brand {
  /** The brand's own name (shown nowhere by default; used for the logo's fallback text). */
  name: string;
  logo: {
    /** Absolute `https:` or `http:` address of the logo picture. The host turns its own path into this. */
    url: string;
    /** What the logo shows, for screen readers and when pictures are blocked. */
    description: string;
    /** Width drawn in the email, in pixels. */
    width: number;
    /** Height drawn in the email, in pixels. */
    height: number;
  };
  /** The one accent colour (buttons, the top rule), as `#rrggbb`. */
  accentColor: string;
  /** The text colour that reads on the accent colour, as `#rrggbb`. */
  onAccentColor: string;
  /** One CSS font stack. No web font is loaded: the stack must end in fonts every reader has. */
  fontStack: string;
  /** The legal footer, one line each (legal name first). */
  footerLines: string[];
  /** Who campaigns are sent as (used by later releases; the test send uses the host's own sender). */
  sender: {
    name: string;
    address: string;
  };
  /** Optional address replies go to. */
  replyTo?: string;
  /** The language of the email, a BCP 47 tag such as `es`. Sets `lang` and the kit's few own words. */
  language: string;
}

/** A text block. `body` is the kit's small plain-text markup, never HTML (see `markup.ts`). */
export interface TextBlock {
  kind: 'text';
  title?: string;
  body: string;
}

/** A picture block. */
export interface PictureBlock {
  kind: 'picture';
  /** Absolute `https:` or `http:` address. */
  url: string;
  /** What the picture shows, for screen readers and when pictures are blocked. */
  description: string;
  /** Optional address the picture links to (`https:`, `http:` or `mailto:`). */
  link?: string;
}

/** A button block. */
export interface ButtonBlock {
  kind: 'button';
  label: string;
  /** `https:`, `http:` or `mailto:`. */
  link: string;
}

export type Block = TextBlock | PictureBlock | ButtonBlock;

/** One email's own content: what changes from email to email inside the brand's template. */
export interface EmailContent {
  subject: string;
  /** The preview line inbox lists show after the subject; hidden in the body. */
  previewLine: string;
  blocks: Block[];
}

/** Links that only later releases fill in. When absent, the template draws nothing in their place. */
export interface ListLinks {
  unsubscribeUrl?: string;
  preferencesUrl?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Who a request comes from, as far as Correos is concerned. */
export type AdminIdentity =
  | { kind: 'admin'; adminId: string; email: string }
  | { kind: 'refused'; reason: 'not_signed_in' | 'not_admin' };

/** One finished message for exactly one recipient. */
export interface SingleMessage {
  /** The one recipient: an address and the host's id for that person (the host checks its own policy on it). */
  to: { address: string; userId: string };
  subject: string;
  html: string;
  text: string;
}

export type SingleSendResult =
  | { status: 'sent' }
  | { status: 'refused'; reason: string }
  | { status: 'not_configured' };

/**
 * What the host app passes in, built once per request. Later releases add adapters here (lists, contacts,
 * the campaign sender, webhooks); each is a plain function so a test can hand in a fake.
 */
export interface CorreosHost {
  brand: Brand;
  /** The site's base address, such as `https://example.test`, without a trailing slash. */
  baseUrl: string;
  /** Who this request is from and whether they are an admin. */
  identify(): Promise<AdminIdentity>;
  /** Send one single message to one address. Never throws: every failure is a result. */
  sendSingle(message: SingleMessage): Promise<SingleSendResult>;
}
