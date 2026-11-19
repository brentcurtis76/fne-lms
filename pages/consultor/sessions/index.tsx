import React from 'react';
import MainLayout from '../../../components/layout/MainLayout';
import SessionsListClasico from '../../../components/sessions/SessionsListClasico';
import { useSessionsList } from '../../../hooks/useSessionsList';

const ConsultorSessionsPage: React.FC = () => {
  const list = useSessionsList();
  const { loading, user, handleLogout } = list;

  if (loading) {
    return (
      <MainLayout user={user} onLogout={handleLogout}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-gray-600">Cargando...</div>
        </div>
      </MainLayout>
    );
  }

  // Where the body's decisions were worked out before SA: from here on, never while loading.
  const decisions = list.decide();

  return (
    <MainLayout user={user} onLogout={handleLogout}>
      <SessionsListClasico list={list} decisions={decisions} />
    </MainLayout>
  );
};

export default ConsultorSessionsPage;
