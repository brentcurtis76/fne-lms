// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ED_ASSIGNABLE_ROLES } from '../../utils/roleUtils';

describe('ED_ASSIGNABLE_ROLES', () => {
  it('includes the five ED-assignable role types', () => {
    expect(ED_ASSIGNABLE_ROLES).toContain('docente');
    expect(ED_ASSIGNABLE_ROLES).toContain('lider_comunidad');
    expect(ED_ASSIGNABLE_ROLES).toContain('lider_generacion');
    expect(ED_ASSIGNABLE_ROLES).toContain('equipo_directivo');
    expect(ED_ASSIGNABLE_ROLES).toContain('encargado_licitacion');
  });

  it('excludes FNE/network-only roles', () => {
    expect(ED_ASSIGNABLE_ROLES).not.toContain('admin');
    expect(ED_ASSIGNABLE_ROLES).not.toContain('consultor');
    expect(ED_ASSIGNABLE_ROLES).not.toContain('community_manager');
    expect(ED_ASSIGNABLE_ROLES).not.toContain('supervisor_de_red');
  });
});
