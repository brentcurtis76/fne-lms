import { describe, it, expect } from 'vitest';
import { contractMatchesSearch } from '../contract-search';

describe('contractMatchesSearch', () => {
  // A normal program-backed contract.
  const programaContract = {
    numero_contrato: 'FNE-2025-08-100',
    descripcion_manual: null,
    clientes: { nombre_legal: 'COLEGIO SAN JOSE', nombre_fantasia: 'San José' },
    programas: { nombre: 'Liderazgo Directivo' },
  };

  // A manual contract: programa_id = null => `programas` is null. This is the
  // exact shape that used to throw and blank the /contracts table.
  const manualContract = {
    numero_contrato: 'FNE-2025-11-633',
    descripcion_manual: 'Asesoría personalizada',
    clientes: {
      nombre_legal: 'CORPORACIÓN EDUCACIONAL COLEGIO LAICO DE VALDIVIA',
      nombre_fantasia: null,
    },
    programas: null,
  };

  it('returns true for empty or whitespace-only queries', () => {
    expect(contractMatchesSearch(programaContract, '')).toBe(true);
    expect(contractMatchesSearch(programaContract, '   ')).toBe(true);
  });

  it('matches by numero_contrato, nombre_legal, nombre_fantasia and programa nombre', () => {
    expect(contractMatchesSearch(programaContract, '08-100')).toBe(true); // numero_contrato
    expect(contractMatchesSearch(programaContract, 'san jose')).toBe(true); // nombre_legal
    expect(contractMatchesSearch(programaContract, 'San José')).toBe(true); // nombre_fantasia
    expect(contractMatchesSearch(programaContract, 'liderazgo')).toBe(true); // programa nombre
  });

  it('is case-insensitive', () => {
    expect(contractMatchesSearch(programaContract, 'LIDERAZGO')).toBe(true);
    expect(contractMatchesSearch(programaContract, 'cOlEgIo')).toBe(true);
  });

  it('does not throw and still matches a manual contract with null programas', () => {
    expect(() => contractMatchesSearch(manualContract, 'valdivia')).not.toThrow();
    expect(contractMatchesSearch(manualContract, 'valdivia')).toBe(true); // nombre_legal
    expect(contractMatchesSearch(manualContract, 'laico')).toBe(true); // nombre_legal
    expect(contractMatchesSearch(manualContract, 'asesoría')).toBe(true); // descripcion_manual
    expect(contractMatchesSearch(manualContract, '633')).toBe(true); // numero_contrato
  });

  it('does not throw on a null-programas row that matches none of the other fields', () => {
    expect(() => contractMatchesSearch(manualContract, 'zzzznomatch')).not.toThrow();
    expect(contractMatchesSearch(manualContract, 'zzzznomatch')).toBe(false);
  });

  it('does not throw when clientes is null', () => {
    const noCliente = { numero_contrato: 'X-1', clientes: null, programas: null };
    expect(() => contractMatchesSearch(noCliente, 'anything')).not.toThrow();
    expect(contractMatchesSearch(noCliente, 'x-1')).toBe(true);
    expect(contractMatchesSearch(noCliente, 'nope')).toBe(false);
  });
});
