import React from 'react';
import MainLayout from '../../../components/layout/MainLayout';
import SessionsListClasico from '../../../components/sessions/SessionsListClasico';
import SessionsListNuevo from '../../../components/sessions/SessionsListNuevo';
import { useSessionsList } from '../../../hooks/useSessionsList';
import { useLook } from '../../../contexts/LookContext';

// The new look's breadcrumb in the top bar (redesign 6S, release SB); today's look passes none.
const FRAME_NUEVO = { breadcrumbs: [{ label: 'Mi Trabajo' }, { label: 'Mis Sesiones' }] };

const ConsultorSessionsPage: React.FC = () => {
  const list = useSessionsList();
  const { loading, user, handleLogout } = list;
  // Release SB: which view draws the list, from the live look, as on Mi Panel. The look is not waited
  // for: while it is unknown it counts as today's, and a look that arrives later swaps the view (the
  // list's state stays in the hook; the list has no part that loads its own data).
  const isNuevo = useLook().look === 'nuevo';
  const frame = isNuevo ? FRAME_NUEVO : {};

  if (loading) {
    return (
      <MainLayout user={user} onLogout={handleLogout} {...frame}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-gray-600">Cargando...</div>
        </div>
      </MainLayout>
    );
  }

  // Where the body's decisions were worked out before SA: from here on, never while loading.
  const decisions = list.decide();

  return (
    <MainLayout user={user} onLogout={handleLogout} {...frame}>
      {isNuevo ? (
        <SessionsListNuevo list={list} decisions={decisions} />
      ) : (
        <SessionsListClasico list={list} decisions={decisions} />
      )}
    </MainLayout>
  );
};

export default ConsultorSessionsPage;
