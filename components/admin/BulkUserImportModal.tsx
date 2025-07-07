import React, { useState } from 'react';
import { X, Upload, Download, AlertCircle, CheckCircle, Users, Copy, Eye, EyeOff, Key } from 'lucide-react';
import { parseBulkUserData, formatParsedData, exportAsCSV, generateSampleCSV } from '../../utils/bulkUserParser';
import { toast } from 'react-hot-toast';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import type { BulkUserData } from '../../types/bulk';

interface BulkUserImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ImportResult {
  email: string;
  success: boolean;
  password?: string;
  error?: string;
}

export default function BulkUserImportModal({ isOpen, onClose, onImportComplete }: BulkUserImportModalProps) {
  const supabase = useSupabaseClient();
  const [csvText, setCsvText] = useState('');
  const [parsedUsers, setParsedUsers] = useState<BulkUserData[]>([]);
  const [invalidUsers, setInvalidUsers] = useState<BulkUserData[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [step, setStep] = useState<'input' | 'preview' | 'results'>('input');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [passwords, setPasswords] = useState<{ email: string; password: string }[]>([]);
  
  // Options
  const [validateRut, setValidateRut] = useState(true);
  const [generatePasswords, setGeneratePasswords] = useState(true);

  if (!isOpen) return null;

  const handleParse = () => {
    if (!csvText.trim()) {
      toast.error('Por favor ingrese datos para importar');
      return;
    }

    const result = parseBulkUserData(csvText, {
      validateRut,
      generatePasswords
    });

    if (result.valid.length === 0 && result.invalid.length === 0) {
      toast.error('No se encontraron datos válidos para procesar');
      return;
    }

    setParsedUsers(result.valid);
    setInvalidUsers(result.invalid);

    if (result.invalid.length > 0) {
      toast(`${result.invalid.length} usuarios con errores no serán importados`, {
        icon: '⚠️',
        style: {
          background: '#FEF3C7',
          color: '#92400E',
        },
      });
    }

    setStep('preview');
  };

  const handleImport = async () => {
    if (parsedUsers.length === 0) {
      toast.error('No hay usuarios válidos para importar');
      return;
    }

    setIsImporting(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/admin/bulk-create-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          csvData: csvText,
          options: {
            validateRut,
            generatePasswords
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al importar usuarios');
      }

      setImportResults(data.results);
      setStep('results');
      
      // Store sessionId if provided
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      const succeeded = data.summary.succeeded;
      const failed = data.summary.failed;

      if (failed === 0) {
        toast.success(`${succeeded} usuarios importados correctamente`);
      } else {
        toast(`${succeeded} usuarios importados, ${failed} fallaron`, {
          icon: '⚠️',
          style: {
            background: '#FEF3C7',
            color: '#92400E',
          },
        });
      }

    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Error al importar usuarios');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setCsvText('');
    setParsedUsers([]);
    setInvalidUsers([]);
    setImportResults(null);
    setStep('input');
    setSessionId(null);
    setPasswords([]);
  };

  const retrievePasswords = async () => {
    if (!sessionId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/admin/retrieve-import-passwords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ sessionId })
      });

      if (!response.ok) {
        throw new Error('Error al recuperar contraseñas');
      }

      const data = await response.json();
      setPasswords(data.passwords);
      setShowPasswords(true);
      toast.success('Contraseñas recuperadas. Esta información solo está disponible una vez.');
      
      // Clear sessionId as passwords can only be retrieved once
      setSessionId(null);
    } catch (error) {
      console.error('Error retrieving passwords:', error);
      toast.error('Error al recuperar contraseñas');
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
    if (importResults && importResults.some(r => r.success)) {
      onImportComplete();
    }
  };

  const downloadSampleCSV = () => {
    const sample = generateSampleCSV(5);
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'usuarios_ejemplo.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadResults = () => {
    if (!importResults) return;

    // SECURITY: Never include passwords in downloadable files
    const csvContent = [
      'email,estado,error',
      ...importResults.map(r => [
        r.email,
        r.success ? 'Exitoso' : 'Fallido',
        r.error || ''
      ].map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resultados_importacion.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyCredentials = () => {
    if (passwords.length === 0) {
      toast.error('Primero debe recuperar las contraseñas');
      return;
    }

    const text = passwords
      .map(p => `${p.email}\t${p.password}`)
      .join('\n');

    navigator.clipboard.writeText(text);
    toast.success('Credenciales copiadas al portapapeles');
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-2">
            <Users className="h-6 w-6 text-[#00365b]" />
            <h3 className="text-xl font-semibold text-[#00365b]">
              Importar Usuarios en Masa
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X size={24} />
          </button>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center mb-6">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center ${step === 'input' ? 'text-[#00365b]' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'input' ? 'bg-[#00365b] text-white' : 'bg-gray-200'
              }`}>
                1
              </div>
              <span className="ml-2 hidden sm:inline">Datos</span>
            </div>
            <div className="w-16 h-0.5 bg-gray-300"></div>
            <div className={`flex items-center ${step === 'preview' ? 'text-[#00365b]' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'preview' ? 'bg-[#00365b] text-white' : 'bg-gray-200'
              }`}>
                2
              </div>
              <span className="ml-2 hidden sm:inline">Vista Previa</span>
            </div>
            <div className="w-16 h-0.5 bg-gray-300"></div>
            <div className={`flex items-center ${step === 'results' ? 'text-[#00365b]' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'results' ? 'bg-[#00365b] text-white' : 'bg-gray-200'
              }`}>
                3
              </div>
              <span className="ml-2 hidden sm:inline">Resultados</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === 'input' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-blue-900">Formato de Datos</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      Pegue los datos en formato CSV o copie desde Excel. 
                      Columnas: email, nombre, apellido, rol, rut (opcional)
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <button
                  onClick={downloadSampleCSV}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Descargar Ejemplo
                </button>
                
                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={validateRut}
                      onChange={(e) => setValidateRut(e.target.checked)}
                      className="rounded border-gray-300 text-[#00365b] focus:ring-[#00365b]"
                    />
                    <span className="ml-2 text-sm text-gray-700">Validar RUT</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={generatePasswords}
                      onChange={(e) => setGeneratePasswords(e.target.checked)}
                      className="rounded border-gray-300 text-[#00365b] focus:ring-[#00365b]"
                    />
                    <span className="ml-2 text-sm text-gray-700">Generar Contraseñas</span>
                  </label>
                </div>
              </div>

              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={`email,nombre,apellido,rol,rut
usuario1@ejemplo.cl,Juan,Pérez,docente,12.345.678-5
usuario2@ejemplo.cl,María,González,consultor,`}
                className="w-full h-64 p-4 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
              />
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-lg font-medium text-gray-900">
                  Vista Previa ({parsedUsers.length} usuarios válidos)
                </h4>
                <button
                  onClick={() => setStep('input')}
                  className="text-sm text-[#00365b] hover:underline"
                >
                  ← Volver a editar
                </button>
              </div>

              {invalidUsers.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-red-900">
                        {invalidUsers.length} usuarios con errores
                      </h4>
                      <div className="mt-2 space-y-1">
                        {invalidUsers.slice(0, 3).map((user, idx) => (
                          <p key={idx} className="text-sm text-red-700">
                            Fila {user.rowNumber}: {user.email || 'Sin email'} - {user.errors?.join(', ')}
                          </p>
                        ))}
                        {invalidUsers.length > 3 && (
                          <p className="text-sm text-red-700">
                            ... y {invalidUsers.length - 3} más
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nombre
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Apellido
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rol
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        RUT
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {parsedUsers.slice(0, 10).map((user, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 text-sm text-gray-900">{user.email}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{user.firstName || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{user.lastName || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{user.rut || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedUsers.length > 10 && (
                  <div className="bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
                    ... y {parsedUsers.length - 10} usuarios más
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'results' && importResults && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-lg font-medium text-gray-900">
                  Resultados de Importación
                </h4>
                <div className="flex items-center space-x-2">
                  {sessionId && (
                    <button
                      onClick={retrievePasswords}
                      className="inline-flex items-center px-3 py-1.5 border border-green-600 text-sm font-medium rounded-md text-green-700 bg-green-50 hover:bg-green-100"
                    >
                      <Key className="h-4 w-4 mr-1" />
                      Recuperar Contraseñas
                    </button>
                  )}
                  {passwords.length > 0 && (
                    <button
                      onClick={() => setShowPasswords(!showPasswords)}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                  {passwords.length > 0 && (
                    <button
                      onClick={copyCredentials}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copiar Credenciales
                    </button>
                  )}
                  <button
                    onClick={downloadResults}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Descargar CSV
                  </button>
                </div>
              </div>

              {/* Security Notice */}
              {passwords.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-yellow-900">Aviso de Seguridad</h4>
                      <p className="text-sm text-yellow-700 mt-1">
                        Las contraseñas han sido recuperadas. Por seguridad, solo pueden recuperarse una vez.
                        Asegúrese de copiarlas o compartirlas de forma segura con los usuarios.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                    <div className="ml-3">
                      <p className="text-sm font-medium text-green-900">Exitosos</p>
                      <p className="text-2xl font-bold text-green-600">
                        {importResults.filter(r => r.success).length}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <AlertCircle className="h-8 w-8 text-red-600" />
                    <div className="ml-3">
                      <p className="text-sm font-medium text-red-900">Fallidos</p>
                      <p className="text-2xl font-bold text-red-600">
                        {importResults.filter(r => !r.success).length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Results table */}
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contraseña
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Error
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {importResults.map((result, idx) => (
                      <tr key={idx} className={result.success ? '' : 'bg-red-50'}>
                        <td className="px-4 py-3">
                          {result.success ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-red-600" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{result.email}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                          {(() => {
                            const pwd = passwords.find(p => p.email === result.email);
                            if (pwd && showPasswords) {
                              return pwd.password;
                            }
                            return result.success ? '••••••••' : '-';
                          })()}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-600">
                          {result.error || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          {step === 'input' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleParse}
                className="px-4 py-2 bg-[#00365b] text-white rounded-md hover:bg-[#002844] transition"
              >
                Continuar
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('input')}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition"
              >
                Volver
              </button>
              <button
                onClick={handleImport}
                disabled={isImporting || parsedUsers.length === 0}
                className="px-4 py-2 bg-[#00365b] text-white rounded-md hover:bg-[#002844] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isImporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Importar {parsedUsers.length} Usuarios
                  </>
                )}
              </button>
            </>
          )}

          {step === 'results' && (
            <>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition"
              >
                Importar Más Usuarios
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-[#00365b] text-white rounded-md hover:bg-[#002844] transition"
              >
                Cerrar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}