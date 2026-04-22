import { describe, it, expect } from 'vitest';
import { classmatesMissingSchool } from '../../../lib/utils/classmateSchoolValidation';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const REQUESTER_SCHOOL = 1;
const OTHER_SCHOOL = 2;

describe('classmatesMissingSchool', () => {
  it('returns [] when a single classmate has one clean role at the requester school', () => {
    const result = classmatesMissingSchool(
      [A],
      [{ user_id: A, school_id: REQUESTER_SCHOOL }],
      REQUESTER_SCHOOL,
    );
    expect(result).toEqual([]);
  });

  it('returns [] when a classmate has one requester-school row and one null-school row', () => {
    const result = classmatesMissingSchool(
      [A],
      [
        { user_id: A, school_id: REQUESTER_SCHOOL },
        { user_id: A, school_id: null },
      ],
      REQUESTER_SCHOOL,
    );
    expect(result).toEqual([]);
  });

  it('returns [] when a classmate has four duplicate requester-school rows', () => {
    const result = classmatesMissingSchool(
      [A],
      [
        { user_id: A, school_id: REQUESTER_SCHOOL },
        { user_id: A, school_id: REQUESTER_SCHOOL },
        { user_id: A, school_id: REQUESTER_SCHOOL },
        { user_id: A, school_id: REQUESTER_SCHOOL },
      ],
      REQUESTER_SCHOOL,
    );
    expect(result).toEqual([]);
  });

  it('returns [id] when the classmate\'s only role has school_id=null', () => {
    const result = classmatesMissingSchool(
      [A],
      [{ user_id: A, school_id: null }],
      REQUESTER_SCHOOL,
    );
    expect(result).toEqual([A]);
  });

  it('returns [id] when the classmate\'s only role is at a different school', () => {
    const result = classmatesMissingSchool(
      [A],
      [{ user_id: A, school_id: OTHER_SCHOOL }],
      REQUESTER_SCHOOL,
    );
    expect(result).toEqual([A]);
  });

  it('returns [id] when the classmate has no rows in the input', () => {
    const result = classmatesMissingSchool([A], [], REQUESTER_SCHOOL);
    expect(result).toEqual([A]);
  });

  it('returns only the invalid id when mixing valid and invalid classmates', () => {
    const result = classmatesMissingSchool(
      [A, B],
      [
        { user_id: A, school_id: REQUESTER_SCHOOL },
        { user_id: B, school_id: OTHER_SCHOOL },
      ],
      REQUESTER_SCHOOL,
    );
    expect(result).toEqual([B]);
  });

  it('returns [] when classmateIds is empty', () => {
    const result = classmatesMissingSchool(
      [],
      [{ user_id: A, school_id: REQUESTER_SCHOOL }],
      REQUESTER_SCHOOL,
    );
    expect(result).toEqual([]);
  });
});
