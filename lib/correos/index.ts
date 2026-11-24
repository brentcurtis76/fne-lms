/**
 * Correos: an email-marketing kit for a Next.js + Supabase + Resend app.
 *
 * Rules of the folder (checked by `lib/correos/__tests__/kit-boundary.test.ts`): it imports only installed
 * packages and its own files, names no brand, and reads no environment variable. The host app hands in a
 * `CorreosHost` (see `types.ts`).
 */
export type {
  AdminIdentity,
  Block,
  Brand,
  ButtonBlock,
  CorreosHost,
  EmailContent,
  ListLinks,
  PictureBlock,
  RenderedEmail,
  SingleMessage,
  SingleSendResult,
  TextBlock,
} from './types';
export { parseBody, bodyToText, safeUrl } from './markup';
export type { BodyNode, Inline } from './markup';
export { validateBlocks, validateContent, MAX_BLOCKS } from './validate';
export { renderEmail, renderText, validateBrand, EmailDocument, EMAIL_WIDTH, CONTENT_WIDTH } from './template';
export { sendTestEmail, TEST_SUBJECT_PREFIX } from './test-send';
export type { TestSendResult } from './test-send';
export { sampleContent } from './sample';
