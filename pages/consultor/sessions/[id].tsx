import React from 'react';
import MainLayout from '../../../components/layout/MainLayout';
import EditRequestModal from '../../../components/sessions/EditRequestModal';
import SessionDetailClasico from '../../../components/sessions/SessionDetailClasico';
import { AlertCircle } from 'lucide-react';
import { useSessionDetail } from '../../../hooks/useSessionDetail';

const SessionDetailPage: React.FC = () => {
  const detail = useSessionDetail();
  const {
    user,
    loading,
    fetchError,
    session,
    showFinalizeModal,
    closeFinalize,
    finalizing,
    showEditRequestModal,
    closeEditRequest,
    submittingEditRequest,
    handleLogout,
    handleFinalize,
    handleSubmitEditRequest,
  } = detail;

  if (loading) {
    return (
      <MainLayout user={user} onLogout={handleLogout}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-gray-600">Cargando...</div>
        </div>
      </MainLayout>
    );
  }

  if (fetchError === 'forbidden') {
    return (
      <MainLayout user={user} onLogout={handleLogout}>
        <div className="flex flex-col items-center justify-center min-h-screen gap-2">
          <AlertCircle className="w-10 h-10 text-red-500" />
          <h2 className="text-xl font-semibold text-gray-900">Acceso denegado</h2>
          <p className="text-gray-600">No tiene permisos para ver esta sesión.</p>
        </div>
      </MainLayout>
    );
  }

  if (fetchError === 'not_found' || !session) {
    return (
      <MainLayout user={user} onLogout={handleLogout}>
        <div className="flex flex-col items-center justify-center min-h-screen gap-2">
          <AlertCircle className="w-10 h-10 text-gray-400" />
          <h2 className="text-xl font-semibold text-gray-900">Sesión no encontrada</h2>
          <p className="text-gray-600">La sesión solicitada no existe o fue eliminada.</p>
        </div>
      </MainLayout>
    );
  }

  // Where today's page worked out its body's decisions: after the refusal returns, on every render.
  const decisions = detail.decide();

  return (
    <MainLayout user={user} onLogout={handleLogout}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SessionDetailClasico detail={detail} decisions={decisions} />

        {/* Finalize Modal */}
        {showFinalizeModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Finalizar Sesión</h3>
              <p className="text-gray-700 mb-6">
                ¿Está seguro que desea finalizar esta sesión? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={closeFinalize}
                  disabled={finalizing}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleFinalize}
                  disabled={finalizing}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {finalizing ? 'Finalizando...' : 'Finalizar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Request Modal */}
        {showEditRequestModal && session && (
          <EditRequestModal
            session={session}
            onClose={closeEditRequest}
            onSubmit={handleSubmitEditRequest}
            submitting={submittingEditRequest}
          />
        )}
      </div>
    </MainLayout>
  );
};

export default SessionDetailPage;
