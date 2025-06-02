import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import LoadingSkeleton from '../common/LoadingSkeleton';

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  requestingUserId?: string;
}

export default function UserDetailModal({ 
  isOpen, 
  onClose, 
  userId, 
  requestingUserId 
}: UserDetailModalProps) {
  const [userDetails, setUserDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserDetails();
    }
  }, [isOpen, userId]);

  const fetchUserDetails = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      // This would normally call an API endpoint for detailed user data
      // For now, we'll show a placeholder
      setTimeout(() => {
        setUserDetails({
          user_name: 'Usuario Ejemplo',
          user_email: 'usuario@ejemplo.com',
          courses: ['Curso 1', 'Curso 2'],
          progress: 75
        });
        setLoading(false);
      }, 1000);
    } catch (error) {
      console.error('Error fetching user details:', error);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Detalles del Usuario
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="space-y-4">
              <LoadingSkeleton variant="text" count={3} />
              <LoadingSkeleton variant="card" />
            </div>
          ) : userDetails ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900">{userDetails.user_name}</h3>
                <p className="text-sm text-gray-600">{userDetails.user_email}</p>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Progreso General</h4>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full" 
                    style={{ width: `${userDetails.progress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-1">{userDetails.progress}% completado</p>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">Cursos</h4>
                <ul className="space-y-1">
                  {userDetails.courses.map((course: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600">• {course}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      Modal de Detalles - En Desarrollo
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>Este modal mostrará información detallada del usuario una vez que se implemente la API correspondiente.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No se pudieron cargar los detalles del usuario</p>
            </div>
          )}

          <div className="flex justify-end mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}