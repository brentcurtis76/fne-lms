// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatFileSize, getFileIcon } from '../../../lib/utils/file-format';

describe('formatFileSize', () => {
  it('returns "0 Bytes" when bytes is exactly 0', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  it('returns "" for null (nullable column fallback)', () => {
    expect(formatFileSize(null)).toBe('');
  });

  it('returns "" for undefined (missing column fallback)', () => {
    expect(formatFileSize(undefined)).toBe('');
  });

  it('formats bytes in KB when under 1 MB', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(512 * 1024)).toBe('512 KB');
  });

  it('formats bytes in MB at the megabyte boundary', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });

  it('formats bytes in GB for large files', () => {
    // The previous meeting inline copy only supported up to MB — a 2 GB
    // video would show as 2048 MB. Canonical helper carries a GB unit so
    // attachment rows display sensible labels for large files.
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe('2 GB');
  });

  it('caps at GB for anything larger (no TB/PB yet)', () => {
    expect(formatFileSize(5 * 1024 * 1024 * 1024 * 1024)).toMatch(/GB$/);
  });

  it('rounds to two decimals', () => {
    expect(formatFileSize(1.2345 * 1024 * 1024)).toBe('1.23 MB');
  });
});

describe('getFileIcon', () => {
  it('returns the 🖼️ image emoji for any image mime', () => {
    expect(getFileIcon('image/png')).toBe('🖼️');
    expect(getFileIcon('image/jpeg')).toBe('🖼️');
  });

  it('returns the 📄 PDF emoji', () => {
    expect(getFileIcon('application/pdf')).toBe('📄');
  });

  it('returns the 📝 word-document emoji', () => {
    expect(getFileIcon('application/msword')).toBe('📝');
    expect(getFileIcon('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('📝');
  });

  it('returns the 📊 spreadsheet emoji for excel/spreadsheet mime substrings', () => {
    expect(getFileIcon('application/vnd.ms-excel')).toBe('📊');
    expect(getFileIcon('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('📊');
  });

  it('returns the 📽️ presentation emoji for powerpoint/presentation mime', () => {
    expect(getFileIcon('application/vnd.ms-powerpoint')).toBe('📽️');
    expect(getFileIcon('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('📽️');
  });

  it('returns the 📎 generic attachment emoji for unknown types', () => {
    expect(getFileIcon('application/octet-stream')).toBe('📎');
    expect(getFileIcon('text/plain')).toBe('📎');
  });

  it('returns 📎 for null/undefined/empty', () => {
    expect(getFileIcon(null)).toBe('📎');
    expect(getFileIcon(undefined)).toBe('📎');
    expect(getFileIcon('')).toBe('📎');
  });
});
