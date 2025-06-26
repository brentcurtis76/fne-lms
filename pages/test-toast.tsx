/**
 * Test page for new toast notification system
 * This page demonstrates all toast types with FNE branding
 */

import { useState } from 'react';
import Head from 'next/head';
import { 
  toastSuccess, 
  toastError, 
  toastInfo, 
  toastLoading,
  toastPromise,
  dismissToast,
  toastConfirm,
  handleApiError
} from '../utils/toastUtils';
import { TOAST_MESSAGES, getGenderedMessage, ENTITY_GENDERS } from '../constants/toastMessages';

export default function TestToastPage() {
  const [loadingToastId, setLoadingToastId] = useState<string | null>(null);

  // Simulate async operation
  const simulateAsyncOperation = (shouldSucceed: boolean) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (shouldSucceed) {
          resolve({ message: 'Operación completada' });
        } else {
          reject(new Error('Error simulado'));
        }
      }, 2000);
    });
  };

  const testToasts = {
    // Basic toasts
    success: () => toastSuccess(TOAST_MESSAGES.GENERIC.SUCCESS),
    error: () => toastError(TOAST_MESSAGES.GENERIC.ERROR),
    info: () => toastInfo('Esta es una notificación informativa'),
    
    // CRUD operations with gendered messages
    createCourse: () => toastSuccess(getGenderedMessage('Curso', 'CREATE', true, false)),
    createTask: () => toastSuccess(getGenderedMessage('Tarea', 'CREATE', true, true)),
    updateUser: () => toastSuccess(getGenderedMessage('Usuario', 'UPDATE', true, false)),
    deleteNotification: () => toastSuccess(getGenderedMessage('Notificación', 'DELETE', true, true)),
    
    // Auth messages
    loginSuccess: () => toastSuccess(TOAST_MESSAGES.AUTH.LOGIN_SUCCESS),
    unauthorized: () => toastError(TOAST_MESSAGES.AUTH.UNAUTHORIZED),
    
    // File operations
    uploadSuccess: () => toastSuccess(TOAST_MESSAGES.FILE.UPLOAD_SUCCESS('documento.pdf')),
    uploadError: () => toastError(TOAST_MESSAGES.FILE.SIZE_ERROR('10MB')),
    
    // Loading states
    loading: () => {
      const id = toastLoading(TOAST_MESSAGES.CRUD.LOADING('datos'));
      setLoadingToastId(id);
    },
    dismissLoading: () => {
      if (loadingToastId) {
        dismissToast(loadingToastId);
        setLoadingToastId(null);
      }
    },
    
    // Promise-based toast
    promiseSuccess: () => {
      toastPromise(
        simulateAsyncOperation(true),
        {
          loading: TOAST_MESSAGES.CRUD.SAVING,
          success: TOAST_MESSAGES.CRUD.SAVE_SUCCESS,
          error: TOAST_MESSAGES.CRUD.SAVE_ERROR,
        }
      );
    },
    promiseError: () => {
      toastPromise(
        simulateAsyncOperation(false),
        {
          loading: TOAST_MESSAGES.CRUD.SAVING,
          success: TOAST_MESSAGES.CRUD.SAVE_SUCCESS,
          error: (err) => TOAST_MESSAGES.CRUD.SAVE_ERROR + ': ' + err.message,
        }
      );
    },
    
    // Confirmation toast
    confirm: () => {
      toastConfirm(
        '¿Estás seguro de que deseas eliminar este elemento?',
        () => toastSuccess('Elemento eliminado'),
        () => toastInfo('Operación cancelada')
      );
    },
    
    // API error handling
    apiError: () => {
      handleApiError({ message: 'Network error' });
    },
    
    // Multiple toasts
    multiple: () => {
      toastSuccess('Primera notificación');
      setTimeout(() => toastInfo('Segunda notificación'), 500);
      setTimeout(() => toastError('Tercera notificación'), 1000);
    },
  };

  return (
    <>
      <Head>
        <title>Test Toast - FNE LMS</title>
      </Head>
      <div className="min-h-screen bg-gray-50 py-8">
          <div className="max-w-4xl mx-auto px-4">
            <h1 className="text-3xl font-bold text-[#00365b] mb-8">
              Sistema de Notificaciones Toast
            </h1>
            
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Prueba de Notificaciones
              </h2>
              <p className="text-gray-600 mb-6">
                Haz clic en los botones para ver diferentes tipos de notificaciones con el estilo de marca FNE.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Basic Toasts */}
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-700 mb-2">Básicas</h3>
                  <button
                    onClick={testToasts.success}
                    className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                  >
                    Éxito
                  </button>
                  <button
                    onClick={testToasts.error}
                    className="w-full px-4 py-2 bg-[#ef4044] text-white rounded hover:bg-[#ef4044]/90 transition-colors"
                  >
                    Error
                  </button>
                  <button
                    onClick={testToasts.info}
                    className="w-full px-4 py-2 bg-[#00365b] text-white rounded hover:bg-[#00365b]/90 transition-colors"
                  >
                    Información
                  </button>
                </div>

                {/* CRUD Operations */}
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-700 mb-2">Operaciones CRUD</h3>
                  <button
                    onClick={testToasts.createCourse}
                    className="w-full px-4 py-2 bg-[#fdb933] text-[#00365b] rounded hover:bg-[#fdb933]/90 transition-colors"
                  >
                    Crear Curso
                  </button>
                  <button
                    onClick={testToasts.createTask}
                    className="w-full px-4 py-2 bg-[#fdb933] text-[#00365b] rounded hover:bg-[#fdb933]/90 transition-colors"
                  >
                    Crear Tarea
                  </button>
                  <button
                    onClick={testToasts.updateUser}
                    className="w-full px-4 py-2 bg-[#fdb933] text-[#00365b] rounded hover:bg-[#fdb933]/90 transition-colors"
                  >
                    Actualizar Usuario
                  </button>
                </div>

                {/* Loading States */}
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-700 mb-2">Estados de Carga</h3>
                  <button
                    onClick={testToasts.loading}
                    className="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                  >
                    Mostrar Cargando
                  </button>
                  <button
                    onClick={testToasts.dismissLoading}
                    className="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                    disabled={!loadingToastId}
                  >
                    Cerrar Cargando
                  </button>
                </div>

                {/* Promise-based */}
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-700 mb-2">Basadas en Promesas</h3>
                  <button
                    onClick={testToasts.promiseSuccess}
                    className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
                  >
                    Promesa Exitosa
                  </button>
                  <button
                    onClick={testToasts.promiseError}
                    className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
                  >
                    Promesa con Error
                  </button>
                </div>

                {/* Special Types */}
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-700 mb-2">Especiales</h3>
                  <button
                    onClick={testToasts.confirm}
                    className="w-full px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
                  >
                    Confirmación
                  </button>
                  <button
                    onClick={testToasts.apiError}
                    className="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                  >
                    Error de API
                  </button>
                </div>

                {/* Multiple */}
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-700 mb-2">Múltiples</h3>
                  <button
                    onClick={testToasts.multiple}
                    className="w-full px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors"
                  >
                    Múltiples Toasts
                  </button>
                </div>
              </div>
            </div>

            {/* Brand Colors Reference */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Colores de Marca
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="w-full h-20 bg-[#00365b] rounded mb-2"></div>
                  <p className="text-sm text-gray-600">Navy Blue</p>
                  <p className="text-xs text-gray-500">#00365b</p>
                </div>
                <div className="text-center">
                  <div className="w-full h-20 bg-[#fdb933] rounded mb-2"></div>
                  <p className="text-sm text-gray-600">Golden Yellow</p>
                  <p className="text-xs text-gray-500">#fdb933</p>
                </div>
                <div className="text-center">
                  <div className="w-full h-20 bg-[#ef4044] rounded mb-2"></div>
                  <p className="text-sm text-gray-600">Error Red</p>
                  <p className="text-xs text-gray-500">#ef4044</p>
                </div>
              </div>
            </div>
          </div>
        </div>
    </>
  );
}