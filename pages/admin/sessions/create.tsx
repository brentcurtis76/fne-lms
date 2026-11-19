import React from 'react';
import MainLayout from '../../../components/layout/MainLayout';
import SessionCreateClasico from '../../../components/sessions/SessionCreateClasico';
import { useSessionCreate } from '../../../hooks/useSessionCreate';

const SessionCreatePage: React.FC = () => {
  // Redesign 6, release SA: the page's state, data calls and handlers live in the hook, unchanged.
  const sessionCreate = useSessionCreate();
  const { user, isAdmin, loading, handleLogout } = sessionCreate;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a0a0a]"></div>
      </div>
    );
  }

  if (!isAdmin) {
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
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
    >
      <SessionCreateClasico sessionCreate={sessionCreate} decisions={decisions} />
    </MainLayout>
  );
};

export default SessionCreatePage;
