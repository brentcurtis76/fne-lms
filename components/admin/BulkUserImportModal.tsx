import React, { useState, useEffect, useMemo } from 'react';
import { X, Upload, Download, AlertCircle, CheckCircle, Users, Copy, Eye, EyeOff, Key, Building } from 'lucide-react';
import { parseBulkUserData, generateSampleCSV } from '../../utils/bulkUserParser';
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

interface School {
  id: number;
  name: string;
  has_generations: boolean;
}

interface Generation {
  id: string;
  name: string;
  school_id: number;
  grade_range?: string;
}

interface Community {
  id: string;
  name: string;
  school_id: number;
  generation_id?: string;
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
  const [globalPassword, setGlobalPassword] = useState('');
  const [useGlobalPassword, setUseGlobalPassword] = useState(true);

  // Organizational data
  const [schools, setSchools] = useState<School[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loadingOrgData, setLoadingOrgData] = useState(false);

  // Global organizational selections
  const [globalSchoolId, setGlobalSchoolId] = useState<number | ''>('');
  const [globalGenerationId, setGlobalGenerationId] = useState<string>('');
  const [globalCommunityId, setGlobalCommunityId] = useState<string>('');

  // Load organizational data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadOrganizationalData();
    }
  }, [isOpen]);

  const loadOrganizationalData = async () => {
    setLoadingOrgData(true);
    try {
      const [schoolsResult, generationsResult, communitiesResult] = await Promise.all([
        supabase.from('schools').select('id, name, has_generations').order('name'),
        supabase.from('generations').select('id, name, school_id, grade_range').order('name'),
        supabase.from('growth_communities').select('id, name, school_id, generation_id').order('name')
      ]);

      if (schoolsResult.data) setSchools(schoolsResult.data);
      if (generationsResult.data) setGenerations(generationsResult.data);
      if (communitiesResult.data) setCommunities(communitiesResult.data);
    } catch (error) {
      console.error('Error loading organizational data:', error);
      toast.error('Error al cargar datos organizacionales');
    } finally {
      setLoadingOrgData(false);
    }
  };

  // Filter generations by selected school
  const filteredGenerations = useMemo(() => {
    if (!globalSchoolId) return [];
    return generations.filter(g => g.school_id === globalSchoolId);
  }, [generations, globalSchoolId]);

  // Filter communities by selected school/generation
  const filteredCommunities = useMemo(() => {
    if (!globalSchoolId) return [];
    let filtered = communities.filter(c => c.school_id === globalSchoolId);
    if (globalGenerationId) {
      filtered = filtered.filter(c => c.generation_id === globalGenerationId || !c.generation_id);
    }
    return filtered;
  }, [communities, globalSchoolId, globalGenerationId]);

  // Check if selected school uses generations
  const selectedSchoolHasGenerations = useMemo(() => {
    if (!globalSchoolId) return false;
    const school = schools.find(s => s.id === globalSchoolId);
    return school?.has_generations ?? false;
  }, [schools, globalSchoolId]);

  // Get selected school name for display
  const selectedSchoolName = useMemo(() => {
    if (!globalSchoolId) return '';
    const school = schools.find(s => s.id === globalSchoolId);
    return school?.name ?? '';
  }, [schools, globalSchoolId]);

  if (!isOpen) return null;

  const handleParse = () => {
    // Validate school selection (required)
    if (!globalSchoolId) {
      toast.error('Debe seleccionar un colegio antes de continuar');
      return;
    }

    // Validate global password if using it
    if (useGlobalPassword && globalPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    if (!csvText.trim()) {
      toast.error('Por favor ingrese datos para importar');
      return;
    }

    const result = parseBulkUserData(csvText, {
      validateRut: false, // RUT validation disabled
      generatePasswords: !useGlobalPassword, // Only generate if not using global password
      organizationalScope: {
        globalSchoolId: globalSchoolId || undefined,
        globalGenerationId: globalGenerationId || undefined,
        globalCommunityId: globalCommunityId || undefined,
      }
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
            validateRut: false,
            generatePasswords: !useGlobalPassword,
            globalPassword: useGlobalPassword ? globalPassword : undefined,
            organizationalScope: {
              globalSchoolId: globalSchoolId || undefined,
              globalGenerationId: globalGenerationId || undefined,
              globalCommunityId: globalCommunityId || undefined,
            }
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
    // Keep organizational selections for next import
  };

  const handleFullReset = () => {
    handleReset();
    setGlobalSchoolId('');
    setGlobalGenerationId('');
    setGlobalCommunityId('');
    setGlobalPassword('');
    setUseGlobalPassword(true);
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
    handleFullReset();
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
      <div className="bg-white rounded-lg p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-2">
            <Users className="h-6 w-6 text-[#0a0a0a]" />
            <h3 className="text-xl font-semibold text-[#0a0a0a]">
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
            <div className={`flex items-center ${step === 'input' ? 'text-[#0a0a0a]' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'input' ? 'bg-[#0a0a0a] text-white' : 'bg-gray-200'
              }`}>
                1
              </div>
              <span className="ml-2 hidden sm:inline">Datos</span>
            </div>
            <div className="w-16 h-0.5 bg-gray-300"></div>
            <div className={`flex items-center ${step === 'preview' ? 'text-[#0a0a0a]' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'preview' ? 'bg-[#0a0a0a] text-white' : 'bg-gray-200'
              }`}>
                2
              </div>
              <span className="ml-2 hidden sm:inline">Vista Previa</span>
            </div>
            <div className="w-16 h-0.5 bg-gray-300"></div>
            <div className={`flex items-center ${step === 'results' ? 'text-[#0a0a0a]' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'results' ? 'bg-[#0a0a0a] text-white' : 'bg-gray-200'
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
              {/* Organizational Assignment Section */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                  <Building className="h-4 w-4 mr-2 text-[#0a0a0a]" />
                  Asignación Organizacional
                </h4>
                <p className="text-xs text-gray-600 mb-4">
                  Todos los usuarios importados serán asignados a la organización seleccionada.
                  Para usuarios con rol <strong>lider_comunidad</strong>, se creará una comunidad automáticamente.
                </p>

                {loadingOrgData ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0a0a0a]"></div>
                    <span className="ml-2 text-sm text-gray-600">Cargando datos...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* School Dropdown - REQUIRED */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Colegio <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={globalSchoolId}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value) : '';
                          setGlobalSchoolId(val);
                          setGlobalGenerationId('');
                          setGlobalCommunityId('');
                        }}
                        className={`w-full p-2 border rounded-md text-sm ${
                          !globalSchoolId ? 'border-red-300 bg-red-50' : 'border-gray-300'
                        }`}
                      >
                        <option value="">Seleccionar colegio (requerido)</option>
                        {schools.map(school => (
                          <option key={school.id} value={school.id}>{school.name}</option>
                        ))}
                      </select>
                      {!globalSchoolId && (
                        <p className="text-xs text-red-600 mt-1">
                          Debe seleccionar un colegio
                        </p>
                      )}
                    </div>

                    {/* Generation Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Generación
                        {selectedSchoolHasGenerations && <span className="text-yellow-600 ml-1">(recomendado)</span>}
                      </label>
                      <select
                        value={globalGenerationId}
                        onChange={(e) => {
                          setGlobalGenerationId(e.target.value);
                          setGlobalCommunityId('');
                        }}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm"
                        disabled={!globalSchoolId || filteredGenerations.length === 0}
                      >
                        <option value="">
                          {!globalSchoolId
                            ? 'Seleccione colegio primero'
                            : filteredGenerations.length === 0
                              ? 'Sin generaciones'
                              : 'Sin asignar'}
                        </option>
                        {filteredGenerations.map(gen => (
                          <option key={gen.id} value={gen.id}>
                            {gen.name} {gen.grade_range ? `(${gen.grade_range})` : ''}
                          </option>
                        ))}
                      </select>
                      {selectedSchoolHasGenerations && !globalGenerationId && globalSchoolId && (
                        <p className="text-xs text-yellow-600 mt-1">
                          Este colegio usa generaciones. Requerido para rol lider_comunidad.
                        </p>
                      )}
                    </div>

                    {/* Community Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Comunidad
                      </label>
                      <select
                        value={globalCommunityId}
                        onChange={(e) => setGlobalCommunityId(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm"
                        disabled={!globalSchoolId}
                      >
                        <option value="">
                          {!globalSchoolId ? 'Seleccione colegio primero' : 'Sin asignar'}
                        </option>
                        {filteredCommunities.map(comm => (
                          <option key={comm.id} value={comm.id}>{comm.name}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Para rol lider_comunidad se creará automáticamente.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Data Format Info */}
              <div className="bg-brand_beige border border-brand_accent rounded-lg p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-brand_primary mt-0.5" />
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-brand_primary">Formato de Datos</h4>
                    <p className="text-sm text-gray-700 mt-1">
                      Pegue los datos en formato CSV o copie desde Excel.
                      Columnas: <strong>email, nombre, apellido, rol</strong>
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Roles válidos: admin, consultor, equipo_directivo, lider_generacion, lider_comunidad, community_manager, docente
                    </p>
                  </div>
                </div>
              </div>

              {/* Password Configuration */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                  <Key className="h-4 w-4 mr-2 text-[#0a0a0a]" />
                  Contraseña Inicial
                </h4>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={useGlobalPassword}
                      onChange={(e) => setUseGlobalPassword(e.target.checked)}
                      className="rounded border-gray-300 text-[#0a0a0a] focus:ring-[#0a0a0a]"
                    />
                    <span className="ml-2 text-sm text-gray-700">Usar misma contraseña para todos</span>
                  </label>

                  {useGlobalPassword && (
                    <div>
                      <input
                        type="text"
                        value={globalPassword}
                        onChange={(e) => setGlobalPassword(e.target.value)}
                        placeholder="Ingrese la contraseña inicial (mín. 8 caracteres)"
                        className={`w-full p-2 border rounded-md text-sm ${
                          globalPassword.length > 0 && globalPassword.length < 8
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-300'
                        }`}
                      />
                      {globalPassword.length > 0 && globalPassword.length < 8 && (
                        <p className="text-xs text-red-600 mt-1">
                          La contraseña debe tener al menos 8 caracteres
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Los usuarios deberán cambiar esta contraseña en su primer inicio de sesión.
                      </p>
                    </div>
                  )}

                  {!useGlobalPassword && (
                    <p className="text-xs text-gray-500">
                      Se generará una contraseña aleatoria para cada usuario.
                    </p>
                  )}
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
              </div>

              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={`email,nombre,apellido,rol
usuario1@ejemplo.cl,Juan,Pérez,docente
usuario2@ejemplo.cl,María,González,lider_comunidad
usuario3@ejemplo.cl,Pedro,Soto,consultor`}
                className="w-full h-48 p-4 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
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
                  className="text-sm text-[#0a0a0a] hover:underline"
                >
                  ← Volver a editar
                </button>
              </div>

              {/* Show organizational assignment summary */}
              <div className="bg-brand_beige border border-brand_accent rounded-lg p-3">
                <p className="text-sm text-brand_primary">
                  <strong>Asignación:</strong> {selectedSchoolName}
                  {globalGenerationId && ` > ${generations.find(g => g.id === globalGenerationId)?.name || ''}`}
                  {globalCommunityId && ` > ${communities.find(c => c.id === globalCommunityId)?.name || ''}`}
                </p>
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
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nombre
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Apellido
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rol
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Colegio
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {parsedUsers.slice(0, 10).map((user, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-3 text-sm text-gray-900">{user.email}</td>
                        <td className="px-3 py-3 text-sm text-gray-900">{user.firstName || '-'}</td>
                        <td className="px-3 py-3 text-sm text-gray-900">{user.lastName || '-'}</td>
                        <td className="px-3 py-3 text-sm">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            user.role === 'lider_comunidad'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-brand_beige text-brand_primary'
                          }`}>
                            {user.role}
                            {user.role === 'lider_comunidad' && ' (auto-comunidad)'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-900">
                          <span className="text-gray-500">
                            {selectedSchoolName || '-'}
                          </span>
                        </td>
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
                      className="inline-flex items-center px-3 py-1.5 border border-brand_accent text-sm font-medium rounded-md text-brand_accent bg-brand_beige hover:bg-amber-100"
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
                <div className="bg-brand_beige border border-brand_accent rounded-lg p-4">
                  <div className="flex items-center">
                    <CheckCircle className="h-8 w-8 text-brand_accent" />
                    <div className="ml-3">
                      <p className="text-sm font-medium text-brand_primary">Exitosos</p>
                      <p className="text-2xl font-bold text-brand_accent">
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
                            <CheckCircle className="h-5 w-5 text-brand_accent" />
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
                disabled={!globalSchoolId || loadingOrgData || (useGlobalPassword && globalPassword.length < 8)}
                className="px-4 py-2 bg-[#0a0a0a] text-white rounded-md hover:bg-[#002844] transition disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="px-4 py-2 bg-[#0a0a0a] text-white rounded-md hover:bg-[#002844] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                className="px-4 py-2 bg-[#0a0a0a] text-white rounded-md hover:bg-[#002844] transition"
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
