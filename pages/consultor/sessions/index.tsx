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

  return (
    <MainLayout user={user} onLogout={handleLogout}>
      <SessionsListClasico list={list} />
    </MainLayout>
  );
};

export default ConsultorSessionsPage;
