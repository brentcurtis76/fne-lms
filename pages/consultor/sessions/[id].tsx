import React from 'react';
import MainLayout from '../../../components/layout/MainLayout';
import EditRequestModal from '../../../components/sessions/EditRequestModal';
import SessionDetailClasico from '../../../components/sessions/SessionDetailClasico';
import SessionDetailNuevo from '../../../components/sessions/SessionDetailNuevo';
import { useViewLatch } from '../../../components/sessions/detail-nuevo/useViewLatch';
import { Button, Dialog } from '../../../components/ui/kit';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSessionDetail, type SessionDetail } from '../../../hooks/useSessionDetail';
import { useLook } from '../../../contexts/LookContext';

// The new look's breadcrumb in the top bar (redesign 6S, release SB); today's look passes none.
const CRUMBS_NUEVO = [{ label: 'Mi Trabajo' }, { label: 'Mis Sesiones', href: '/consultor/sessions' }];

const SessionDetailPage: React.FC = () => {
  const detail = useSessionDetail();
  // Release SB: the page's own component keeps exactly today's hooks (the hook's); the latch of the
  // view (a ref) lives one component below, which draws what today's page drew, element for element.
  return <SessionDetailScreen detail={detail} />;
};

function SessionDetailScreen({ detail }: { detail: SessionDetail }) {
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
  // Release SB: which view draws the body. Nothing waits for the look (an unknown look counts as
  // today's); today's look always draws today's body at once; a new look that arrives within four
  // seconds of the loaded session's body's first render is followed once; otherwise the view is
  // latched, so a new look that arrives later never mounts the Zoom suggestions or the audio recorder
  // a second time (components/sessions/detail-nuevo/useViewLatch).
  // Only the look is read here (its value changes only when the look does), so an update of the
  // account's state that changes neither renders this body again. The frame's breadcrumbs follow the
  // same latched view, so the page's parts agree with its body.
  const { look } = useLook();
  const picked = useViewLatch({
    look,
    sessionId: session?.id ?? null,
    drawing: !loading && !fetchError && Boolean(session),
  });
  const frame =
    picked === 'nuevo'
      ? { breadcrumbs: session ? [...CRUMBS_NUEVO, { label: session.title }] : CRUMBS_NUEVO }
      : {};

  if (loading) {
    return (
      <MainLayout user={user} onLogout={handleLogout} {...frame}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-gray-600">Cargando...</div>
        </div>
      </MainLayout>
    );
  }

  if (fetchError === 'forbidden') {
    return (
      <MainLayout user={user} onLogout={handleLogout} {...frame}>
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
      <MainLayout user={user} onLogout={handleLogout} {...frame}>
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
    <MainLayout user={user} onLogout={handleLogout} {...frame}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {picked === 'nuevo' ? (
          <SessionDetailNuevo detail={detail} decisions={decisions} />
        ) : (
          <SessionDetailClasico detail={detail} decisions={decisions} />
        )}

        {/* Finalize Modal */}
        {picked === 'nuevo' ? (
          // The new look's window (approved): a close X and Escape, «Finalizar» the yellow answer.
          <Dialog
            open={showFinalizeModal}
            onClose={closeFinalize}
            dismissable={!finalizing}
            title="Finalizar Sesión"
            data-testid="session-finalize-dialog"
            footer={
              <>
                <Button variant="outline" onClick={closeFinalize} disabled={finalizing}>
                  Cancelar
                </Button>
                <Button variant="confirm" onClick={handleFinalize} disabled={finalizing}>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {finalizing ? 'Finalizando...' : 'Finalizar'}
                </Button>
              </>
            }
          >
            <p>¿Está seguro que desea finalizar esta sesión? Esta acción no se puede deshacer.</p>
          </Dialog>
        ) : (
          showFinalizeModal && (
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
          )
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
}

export default SessionDetailPage;
