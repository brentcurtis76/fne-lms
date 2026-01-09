import React, { useState } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '../../components/layout/MainLayout';
import { useUser, useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';
import { DatabaseIcon } from '@heroicons/react/outline';

const ApplyNetworkMigration: React.FC = () => {
  const router = useRouter();
  const user = useUser();
  const supabase = useSupabaseClient();
  const [checking, setChecking] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<{
    tablesExist: boolean;
    enumUpdated: boolean;
    message: string;
  } | null>(null);

  const checkMigrationStatus = async () => {
    setChecking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch('/api/admin/init-supervisor-tables', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      setMigrationStatus({
        tablesExist: data.success,
        enumUpdated: data.success,
        message: data.message
      });

      if (data.success) {
        toast.success('¡Las tablas están configuradas correctamente!');
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error('Error checking migration:', error);
      toast.error('Error al verificar el estado de la migración');
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <MainLayout
      user={user}
      currentPage="network-migration"
      pageTitle="Aplicar Migración de Red"
      breadcrumbs={[
        { label: 'Inicio', href: '/dashboard' },
        { label: 'Aplicar Migración' }
      ]}
      isAdmin={true}
      onLogout={handleLogout}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center mb-6">
            <DatabaseIcon className="h-8 w-8 text-[#0a0a0a] mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">
              Migración de Base de Datos - Supervisor de Red
            </h1>
          </div>

          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Estado de la Migración</h2>
            
            {migrationStatus && (
              <div className={`p-4 rounded-lg ${
                migrationStatus.tablesExist
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-yellow-50 text-yellow-800'
              }`}>
                <p className="font-medium">{migrationStatus.message}</p>
              </div>
            )}

            <button
              onClick={checkMigrationStatus}
              disabled={checking}
              className="mt-4 px-4 py-2 bg-[#0a0a0a] text-white rounded hover:bg-[#0a0a0a]/90 disabled:opacity-50"
            >
              {checking ? 'Verificando...' : 'Verificar Estado de Migración'}
            </button>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold mb-4">
              Instrucciones para Aplicar la Migración
            </h2>
            
            <div className="bg-gray-50 rounded-lg p-6">
              <ol className="space-y-4">
                <li className="flex">
                  <span className="flex-shrink-0 w-8 h-8 bg-[#fbbf24] text-[#0a0a0a] rounded-full flex items-center justify-center font-bold mr-3">
                    1
                  </span>
                  <div>
                    <strong>Accede al Dashboard de Supabase</strong>
                    <p className="text-sm text-gray-600">
                      Ve a tu proyecto de Supabase y navega a la sección "SQL Editor"
                    </p>
                  </div>
                </li>
                
                <li className="flex">
                  <span className="flex-shrink-0 w-8 h-8 bg-[#fbbf24] text-[#0a0a0a] rounded-full flex items-center justify-center font-bold mr-3">
                    2
                  </span>
                  <div>
                    <strong>Copia el SQL de Migración</strong>
                    <p className="text-sm text-gray-600">
                      Abre el archivo: <code className="bg-gray-200 px-2 py-1 rounded text-xs">
                        /database/add-supervisor-de-red-role-fixed.sql
                      </code>
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Copia todo el contenido del archivo
                    </p>
                  </div>
                </li>
                
                <li className="flex">
                  <span className="flex-shrink-0 w-8 h-8 bg-[#fbbf24] text-[#0a0a0a] rounded-full flex items-center justify-center font-bold mr-3">
                    3
                  </span>
                  <div>
                    <strong>Ejecuta la Migración en DOS PASOS</strong>
                    <p className="text-sm text-gray-600">
                      <strong>PASO 1:</strong> Ejecuta SOLO la primera parte (hasta "COMMIT the enum change")
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      <strong>PASO 2:</strong> Después ejecuta el resto (desde "BEGIN;")
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Esto evita el error "unsafe use of new value of enum type"
                    </p>
                  </div>
                </li>
                
                <li className="flex">
                  <span className="flex-shrink-0 w-8 h-8 bg-[#fbbf24] text-[#0a0a0a] rounded-full flex items-center justify-center font-bold mr-3">
                    4
                  </span>
                  <div>
                    <strong>Verifica la Instalación</strong>
                    <p className="text-sm text-gray-600">
                      Haz clic en "Verificar Estado de Migración" arriba para confirmar
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Una vez verificado, podrás usar la gestión de redes
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </div>

          <div className="mt-8 border-t pt-6">
            <h3 className="font-semibold mb-2">¿Qué crea esta migración?</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Tabla <code className="bg-gray-200 px-1 rounded">redes_de_colegios</code> - Para almacenar información de redes</li>
              <li>• Tabla <code className="bg-gray-200 px-1 rounded">red_escuelas</code> - Para vincular escuelas a redes</li>
              <li>• Rol <code className="bg-gray-200 px-1 rounded">supervisor_de_red</code> - Nuevo tipo de rol de usuario</li>
              <li>• Políticas RLS - Para acceso seguro a datos</li>
              <li>• Funciones auxiliares - Para gestión de permisos</li>
            </ul>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => router.push('/admin/network-management')}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 mr-3"
            >
              Volver a Gestión de Redes
            </button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ApplyNetworkMigration;