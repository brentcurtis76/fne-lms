// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { csvEscape, neutralizeSpreadsheetFormula } from '../exportUtils';

describe('exportUtils spreadsheet formula hardening', () => {
  it('prefixes formula-like text values', () => {
    expect(neutralizeSpreadsheetFormula('=HYPERLINK("https://example.test")')).toBe(
      '\'=HYPERLINK("https://example.test")'
    );
    expect(neutralizeSpreadsheetFormula('@cmd')).toBe("'@cmd");
    expect(neutralizeSpreadsheetFormula('-1+cmd|/C calc!A0')).toBe("'-1+cmd|/C calc!A0");
  });

  it('leaves plain positive and negative numbers numeric', () => {
    expect(neutralizeSpreadsheetFormula('-12.50')).toBe('-12.50');
    expect(neutralizeSpreadsheetFormula('+12.50')).toBe('+12.50');
    expect(neutralizeSpreadsheetFormula('  -1,234.50  ')).toBe('  -1,234.50  ');
  });

  it('still prefixes tab and carriage-return payloads', () => {
    expect(neutralizeSpreadsheetFormula('12\t=cmd')).toBe("'12\t=cmd");
    expect(neutralizeSpreadsheetFormula('12\r=cmd')).toBe("'12\r=cmd");
  });

  it('escapes CSV after neutralizing formulas', () => {
    expect(csvEscape('=cmd,still text')).toBe('"\'=cmd,still text"');
    expect(csvEscape('-12.50')).toBe('-12.50');
  });
});
