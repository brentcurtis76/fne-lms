import React from 'react';
import MainLayout from '../../../components/layout/MainLayout';
import SessionCreateClasico from '../../../components/sessions/SessionCreateClasico';
import SessionCreateNuevo from '../../../components/sessions/SessionCreateNuevo';
import { SessionCreateDenied, SessionCreateSkeleton } from '../../../components/sessions/create-nuevo/SessionCreateStates';
import { useSessionCreate } from '../../../hooks/useSessionCreate';
import { useLook } from '../../../contexts/LookContext';

// The new look's breadcrumbs in the top bar (redesign 6, release SB); today's look keeps `[]`.
const BREADCRUMBS_NUEVO = [{ label: 'Sesiones', href: '/admin/sessions' }, { label: 'Programar Sesión' }];

const SessionCreatePage: React.FC = () => {
  // Redesign 6, release SA: the page's state, data calls and handlers live in the hook, unchanged.
  const sessionCreate = useSessionCreate();
  const { user, isAdmin, loading, handleLogout } = sessionCreate;
  // Redesign 6, release SB: which view draws the form. Today's look draws exactly today's page; the new
  // look draws its loading and refusal inside the frame (approved). As on Mi Panel the look is not
  // waited for: a look that arrives later swaps the view, and the form's state stays in the hook.
  const isNuevo = useLook().look === 'nuevo';

  if (loading) {
    if (isNuevo) {
      return (
        <MainLayout
          user={user}
          currentPage="sessions"
          pageTitle=""
          breadcrumbs={BREADCRUMBS_NUEVO}
          isAdmin={isAdmin}
          onLogout={handleLogout}
        >
          <SessionCreateSkeleton />
        </MainLayout>
      );
    }
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a0a0a]"></div>
      </div>
    );
  }

  if (!isAdmin) {
    if (isNuevo) {
      return (
        <MainLayout
          user={user}
          currentPage="sessions"
          pageTitle=""
          breadcrumbs={BREADCRUMBS_NUEVO}
          isAdmin={isAdmin}
          onLogout={handleLogout}
        >
          <SessionCreateDenied />
        </MainLayout>
      );
    }
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#0a0a0a] mb-4">Acceso Denegado</h1>
          <p className="text-gray-600">No tiene permisos para acceder a esta página.</p>
        </div>
      </div>
    );
  }

  // Where the form's decisions were worked out before SA: from here on, never while loading or refused.
  const decisions = sessionCreate.decide();

  return (
    <MainLayout
      user={user}
      currentPage="sessions"
      pageTitle=""
      breadcrumbs={isNuevo ? BREADCRUMBS_NUEVO : []}
      isAdmin={isAdmin}
      onLogout={handleLogout}
    >
      {isNuevo ? (
        <SessionCreateNuevo sessionCreate={sessionCreate} decisions={decisions} />
      ) : (
        <SessionCreateClasico sessionCreate={sessionCreate} decisions={decisions} />
      )}
    </MainLayout>
  );
};

export default SessionCreatePage;
