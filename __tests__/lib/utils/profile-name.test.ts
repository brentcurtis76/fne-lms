// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { profileName } from '../../../lib/utils/profile-name';

describe('profileName', () => {
  it('returns "First Last" when both name fields are present', () => {
    expect(profileName({ first_name: 'Ana', last_name: 'Pérez' })).toBe('Ana Pérez');
  });

  it('returns only first name when last_name is null', () => {
    expect(profileName({ first_name: 'Ana', last_name: null })).toBe('Ana');
  });

  it('returns only last name when first_name is null', () => {
    expect(profileName({ first_name: null, last_name: 'Pérez' })).toBe('Pérez');
  });

  it('falls back to `name` when first+last are both blank', () => {
    // Supabase auth rows carry `raw_user_meta_data.name` instead of a split
    // first/last — the helper must prefer it over the email fallback.
    expect(
      profileName({ first_name: '', last_name: null, name: 'Ana P.', email: 'ana@test.cl' }),
    ).toBe('Ana P.');
  });

  it('falls back to email when first+last+name are all blank', () => {
    expect(
      profileName({ first_name: null, last_name: null, name: null, email: 'ana@test.cl' }),
    ).toBe('ana@test.cl');
  });

  it('returns the provided fallback when every input is blank', () => {
    expect(
      profileName({ first_name: null, last_name: null, email: null }, 'Facilitador'),
    ).toBe('Facilitador');
  });

  it('returns the default fallback ("Sin nombre") when no fallback is passed', () => {
    expect(profileName({ first_name: null, last_name: null })).toBe('Sin nombre');
  });

  it('returns the fallback when profile itself is null', () => {
    expect(profileName(null, 'Asistente')).toBe('Asistente');
  });

  it('returns the fallback when profile itself is undefined', () => {
    expect(profileName(undefined, 'Asistente')).toBe('Asistente');
  });

  it('treats whitespace-only first+last as blank and falls through', () => {
    // `"  "` trims to `""`, so the helper skips to the `name`/email path.
    expect(
      profileName({ first_name: '  ', last_name: '  ', email: 'ana@test.cl' }),
    ).toBe('ana@test.cl');
  });

  it('preserves internal whitespace in multi-word first names', () => {
    expect(profileName({ first_name: 'María José', last_name: 'Pérez' })).toBe('María José Pérez');
  });

  it('trims leading and trailing whitespace on the composed name', () => {
    // trim() runs on the concatenated `"${first} ${last}"` — leading space
    // on first_name and trailing space on last_name collapse at the edges.
    // The inner separator space (between first and last) is preserved.
    expect(profileName({ first_name: ' Ana', last_name: 'Pérez ' })).toBe('Ana Pérez');
  });
});
