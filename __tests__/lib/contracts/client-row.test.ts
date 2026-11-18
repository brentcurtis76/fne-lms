import { describe, it, expect } from 'vitest';
import { buildClientRow, CLIENT_ROW_COLUMNS } from '../../../lib/contracts/client-row';

/**
 * F10b (GES-2.1): the row ContractForm writes into public.clientes holds only
 * that table's columns. The list below is written out by hand from the table
 * definition in supabase/migrations/00000000000000_baseline.sql (clientes),
 * minus id and created_at, which the form never writes.
 */
const EXPECTED_COLUMNS = [
  'nombre_legal',
  'nombre_fantasia',
  'rut',
  'direccion',
  'comuna',
  'ciudad',
  'nombre_representante',
  'rut_representante',
  'fecha_escritura',
  'nombre_notario',
  'comuna_notaria',
  'nombre_encargado_proyecto',
  'telefono_encargado_proyecto',
  'email_encargado_proyecto',
  'nombre_contacto_administrativo',
  'telefono_contacto_administrativo',
  'email_contacto_administrativo',
  'school_id',
];

const fullForm = {
  nombre_legal: 'Colegio Inventado SpA',
  nombre_fantasia: 'Colegio Inventado',
  rut: '76.123.456-0',
  direccion: 'Calle Falsa 123',
  comuna: 'Comuna Inventada',
  ciudad: 'Ciudad Inventada',
  nombre_representante: 'Persona Inventada',
  rut_representante: '11.222.333-4',
  fecha_escritura: '2020-01-02',
  nombre_notario: 'Notaría Inventada',
  comuna_notaria: 'Comuna Notarial',
  nombre_encargado_proyecto: 'Encargada Inventada',
  telefono_encargado_proyecto: '+56 9 0000 0000',
  email_encargado_proyecto: 'encargada@ejemplo.test',
  nombre_contacto_administrativo: 'Contacto Inventado',
  telefono_contacto_administrativo: '+56 2 0000 0000',
  email_contacto_administrativo: 'contacto@ejemplo.test',
};

describe('buildClientRow', () => {
  it('lists exactly the clientes columns the form may write', () => {
    expect([...CLIENT_ROW_COLUMNS].sort()).toEqual([...EXPECTED_COLUMNS].sort());
  });

  it('returns exactly those columns and drops telefono and any other stray key', () => {
    const row = buildClientRow({ ...fullForm, telefono: '', id: 'x', created_at: 'y', foo: 1 } as any, 7);
    expect(Object.keys(row).sort()).toEqual([...EXPECTED_COLUMNS].sort());
    expect(row).not.toHaveProperty('telefono');
    expect(row).not.toHaveProperty('foo');
    expect(row).not.toHaveProperty('id');
  });

  it('copies the form values unchanged and sets school_id', () => {
    const row = buildClientRow(fullForm, 7);
    expect(row).toEqual({ ...fullForm, school_id: 7 });
  });

  it('writes school_id as null when no school is chosen', () => {
    expect(buildClientRow(fullForm, '').school_id).toBeNull();
    expect(buildClientRow(fullForm, null).school_id).toBeNull();
    expect(buildClientRow(fullForm, undefined).school_id).toBeNull();
  });

  it('fills a column missing from the form object with an empty string', () => {
    const { comuna_notaria: _omit, ...partial } = fullForm;
    const row = buildClientRow(partial, 3);
    expect(row.comuna_notaria).toBe('');
    expect(Object.keys(row).sort()).toEqual([...EXPECTED_COLUMNS].sort());
  });
});
