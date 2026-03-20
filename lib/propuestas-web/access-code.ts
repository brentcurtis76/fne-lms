import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Characters: uppercase + digits, excluding ambiguous (0/O, 1/I/L)
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateAccessCode(length = 6): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes)
    .map((b) => CHARSET[b % CHARSET.length])
    .join('');
}

export async function hashAccessCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export async function verifyAccessCode(
  code: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

export function generateSlug(
  schoolName: string,
  serviceType: string,
  year: number,
  version: number
): string {
  const sanitize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);
  return `${sanitize(schoolName)}-${sanitize(serviceType)}-${year}-v${version}`;
}
