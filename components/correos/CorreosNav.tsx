import React from 'react';
import { TabLinks } from '../ui/kit';

/** The row of tabs between the Correos screens. Not a menu entry: the screens are reached by typing an address. */
export type CorreosSection = 'listas' | 'contactos' | 'importar' | 'usuarios' | 'pasantias';

const ITEMS: { key: CorreosSection; href: string; label: string }[] = [
  { key: 'contactos', href: '/admin/correos/contactos', label: 'Contactos' },
  { key: 'listas', href: '/admin/correos/listas', label: 'Listas' },
  { key: 'importar', href: '/admin/correos/importar', label: 'Importar archivo' },
  { key: 'usuarios', href: '/admin/correos/usuarios', label: 'Usuarios de la plataforma' },
  { key: 'pasantias', href: '/admin/correos/pasantias', label: 'Interesados en pasantías' },
];

export function CorreosNav({ current }: { current: CorreosSection }) {
  return (
    <TabLinks
      label="Secciones de Correos"
      className="mt-4 overflow-x-auto"
      items={ITEMS.map((item) => ({
        href: item.href,
        label: item.label,
        current: item.key === current,
        'data-testid': `correos-nav-${item.key}`,
      }))}
    />
  );
}
