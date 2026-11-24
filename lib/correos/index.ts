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
export { parseContactsCsv, looksLikeBinary, normalizeHeader, MAX_CSV_ROWS, MAX_CSV_BYTES, CSV_REFUSAL_MESSAGES } from './csv';
export type { CsvContactRow, CsvColumn, CsvParseResult, CsvRefusal } from './csv';
export { parseReason, LEGAL_BASES, LEGAL_BASIS_LABELS, REASON_MESSAGES } from './reason';
export type { LegalBasis, Reason, ReasonResult, ReasonOptions } from './reason';
export { isValidAddress, normalizeAddress, isUuid, readIds, searchTerm, ilikeAny, readPage } from './address';
export {
  GENERIC_FAILURE,
  DATABASE_CODE_MESSAGES,
  databaseCode,
  databaseErrorMessage,
  isUniqueViolation,
  LIST_MESSAGES,
  CONTACT_MESSAGES,
} from './messages';
export {
  PAGE_SIZE,
  addressFingerprint,
  listLists,
  parseListInput,
  createList,
  updateList,
  addContacts,
  searchContacts,
  getContactDetail,
  contactIdFor,
  eraseContact,
} from './contacts';
export type {
  AddCounts,
  AddContactsArgs,
  ContactDetail,
  ContactListItem,
  ContactMembership,
  ContactRowInput,
  ContactSource,
  EraseResult,
  ListInput,
  ListSummary,
  BlockReason,
} from './contacts';
export { STATE_LABELS, JOINED_VIA_LABELS, UNSUBSCRIBED_BY_LABELS, BLOCK_REASON_LABELS, labelFor, formatDate } from './labels';
