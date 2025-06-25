/**
 * Role Switcher Component for Developers
 * Allows devs to impersonate different roles for testing
 */

import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { 
  UserRoleType, 
  School, 
  Generation, 
  GrowthCommunity,
  ROLE_NAMES 
} from '../../types/roles';
import { devRoleService, ImpersonationContext } from '../../lib/services/devRoleService';
import { 
  CodeIcon, 
  UserGroupIcon,
  XIcon,
  ExclamationIcon,
  RefreshIcon
} from '@heroicons/react/outline';

interface RoleSwitcherProps {
  user: User;
  onRoleChange?: (context: ImpersonationContext | null) => void;
}

const RoleSwitcher: React.FC<RoleSwitcherProps> = ({ user, onRoleChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeImpersonation, setActiveImpersonation] = useState<ImpersonationContext | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  // Form state
  const [selectedRole, setSelectedRole] = useState<UserRoleType | ''>('');
  const [selectedSchool, setSelectedSchool] = useState('');
  const [selectedGeneration, setSelectedGeneration] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState('');
  
  // Available options
  const [schools, setSchools] = useState<School[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [communities, setCommunities] = useState<GrowthCommunity[]>([]);
  
  const availableRoles = devRoleService.getAvailableRoles();

  // Check for active impersonation on mount
  useEffect(() => {
    checkActiveImpersonation();
    
    // Listen for impersonation changes
    const handleImpersonationChange = (event: CustomEvent) => {
      setActiveImpersonation(event.detail);
      if (onRoleChange) {
        onRoleChange(event.detail);
      }
    };
    
    window.addEventListener('dev-impersonation-changed', handleImpersonationChange as EventListener);
    return () => {
      window.removeEventListener('dev-impersonation-changed', handleImpersonationChange as EventListener);
    };
  }, [user.id]);

  // Load schools when modal opens
  useEffect(() => {
    if (isOpen) {
      loadSchools();
    }
  }, [isOpen]);

  // Load generations when school changes
  useEffect(() => {
    if (selectedSchool) {
      loadGenerations(selectedSchool);
    } else {
      setGenerations([]);
      setSelectedGeneration('');
    }
  }, [selectedSchool]);

  // Load communities when school/generation changes
  useEffect(() => {
    if (selectedSchool) {
      loadCommunities(selectedSchool, selectedGeneration);
    } else {
      setCommunities([]);
      setSelectedCommunity('');
    }
  }, [selectedSchool, selectedGeneration]);

  const checkActiveImpersonation = async () => {
    const session = await devRoleService.getActiveImpersonation(user.id);
    if (session) {
      setActiveImpersonation({
        role: session.impersonated_role,
        userId: session.impersonated_user_id,
        schoolId: session.school_id ? String(session.school_id) : undefined,
        generationId: session.generation_id,
        communityId: session.community_id,
        sessionToken: session.session_token,
        expiresAt: session.expires_at
      });
    }
  };

  const loadSchools = async () => {
    const schoolList = await devRoleService.getAvailableSchools();
    setSchools(schoolList);
  };

  const loadGenerations = async (schoolId: string) => {
    const genList = await devRoleService.getAvailableGenerations(schoolId);
    setGenerations(genList);
  };

  const loadCommunities = async (schoolId: string, generationId?: string) => {
    const commList = await devRoleService.getAvailableCommunities(
      schoolId,
      generationId || undefined
    );
    setCommunities(commList);
  };

  const handleStartImpersonation = async () => {
    if (!selectedRole) return;
    
    setLoading(true);
    try {
      const context: ImpersonationContext = {
        role: selectedRole as UserRoleType,
        schoolId: selectedSchool || undefined,
        generationId: selectedGeneration || undefined,
        communityId: selectedCommunity || undefined
      };

      const result = await devRoleService.startImpersonation(user.id, context);
      
      if (result.success) {
        setIsOpen(false);
        resetForm();
        toast.success('Suplantación iniciada correctamente');
        // The event listener will update the UI
      } else {
        toast.error(result.error || 'Error al iniciar suplantación');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEndImpersonation = async () => {
    setShowConfirmModal(true);
  };
  
  const confirmEndImpersonation = async () => {
    setShowConfirmModal(false);
    setLoading(true);
    try {
      const result = await devRoleService.endImpersonation(user.id);
      
      if (result.success) {
        toast.success('Suplantación terminada correctamente');
      } else {
        toast.error(result.error || 'Error al terminar suplantación');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedRole('');
    setSelectedSchool('');
    setSelectedGeneration('');
    setSelectedCommunity('');
  };

  const getRoleSpecificFields = () => {
    if (!selectedRole) return null;

    switch (selectedRole) {
      case 'admin':
        return null; // No additional fields needed
        
      case 'consultor':
      case 'equipo_directivo':
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor="school-select" className="block text-sm font-medium text-gray-700 mb-1">
                Colegio (Opcional)
              </label>
              <select
                id="school-select"
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
              >
                <option value="">Sin colegio específico</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
        
      case 'lider_generacion':
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor="school-select-lg" className="block text-sm font-medium text-gray-700 mb-1">
                Colegio <span className="text-red-500">*</span>
              </label>
              <select
                id="school-select-lg"
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                required
              >
                <option value="">Seleccionar colegio</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedSchool && (
              <div>
                <label htmlFor="generation-select" className="block text-sm font-medium text-gray-700 mb-1">
                  Generación <span className="text-red-500">*</span>
                </label>
                <select
                  id="generation-select"
                  value={selectedGeneration}
                  onChange={(e) => setSelectedGeneration(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                  required
                >
                  <option value="">Seleccionar generación</option>
                  {generations.map((gen) => (
                    <option key={gen.id} value={gen.id}>
                      {gen.name} {gen.grade_range && `(${gen.grade_range})`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
        
      case 'lider_comunidad':
      case 'docente':
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor="school-select-lc" className="block text-sm font-medium text-gray-700 mb-1">
                Colegio <span className="text-red-500">*</span>
              </label>
              <select
                id="school-select-lc"
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                required
              >
                <option value="">Seleccionar colegio</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedSchool && generations.length > 0 && (
              <div>
                <label htmlFor="generation-select-opt" className="block text-sm font-medium text-gray-700 mb-1">
                  Generación (Opcional)
                </label>
                <select
                  id="generation-select-opt"
                  value={selectedGeneration}
                  onChange={(e) => setSelectedGeneration(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                >
                  <option value="">Sin generación específica</option>
                  {generations.map((gen) => (
                    <option key={gen.id} value={gen.id}>
                      {gen.name} {gen.grade_range && `(${gen.grade_range})`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedSchool && communities.length > 0 && (
              <div>
                <label htmlFor="community-select" className="block text-sm font-medium text-gray-700 mb-1">
                  Comunidad (Opcional)
                </label>
                <select
                  id="community-select"
                  value={selectedCommunity}
                  onChange={(e) => setSelectedCommunity(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                >
                  <option value="">Sin comunidad específica</option>
                  {communities.map((comm) => (
                    <option key={comm.id} value={comm.id}>
                      {comm.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <>
      {/* Floating Dev Button */}
      <div className="fixed bottom-24 right-6 z-50">
        {activeImpersonation ? (
          <div className="bg-red-600 text-white rounded-lg shadow-lg p-3 flex items-center space-x-3">
            <ExclamationIcon className="h-5 w-5" />
            <div>
              <p className="text-sm font-semibold">Modo Dev Activo</p>
              <p className="text-xs">
                Rol: {ROLE_NAMES[activeImpersonation.role]}
              </p>
            </div>
            <button
              onClick={handleEndImpersonation}
              disabled={loading}
              className="ml-2 p-1 hover:bg-red-700 rounded"
              title="Terminar suplantación"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white rounded-full p-4 shadow-lg transition-colors duration-200"
            title="Cambiar rol (Dev)"
          >
            <CodeIcon className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <UserGroupIcon className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Cambiar Rol (Modo Dev)
                    </h2>
                    <p className="text-sm text-gray-500">
                      Suplantar un rol para pruebas
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XIcon className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Warning */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <ExclamationIcon className="h-5 w-5 text-yellow-600 mt-0.5 mr-2" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-semibold mb-1">Modo Desarrollador</p>
                    <p>
                      Los cambios de rol son temporales y solo afectan tu sesión. 
                      La suplantación expira automáticamente después de 8 horas.
                    </p>
                  </div>
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label htmlFor="role-select" className="block text-sm font-medium text-gray-700 mb-1">
                  Rol a Suplantar <span className="text-red-500">*</span>
                </label>
                <select
                  id="role-select"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as UserRoleType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                  required
                >
                  <option value="">Seleccionar rol</option>
                  {availableRoles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label} - {role.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Role-specific fields */}
              {getRoleSpecificFields()}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsOpen(false);
                  resetForm();
                }}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleStartImpersonation}
                disabled={!selectedRole || loading}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {loading ? (
                  <>
                    <RefreshIcon className="animate-spin h-4 w-4 mr-2" />
                    Iniciando...
                  </>
                ) : (
                  'Iniciar Suplantación'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <ExclamationIcon className="h-6 w-6 text-[#fdb933]" />
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">
                  Confirmar acción
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    ¿Terminar la suplantación de rol actual?
                  </p>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00365b]"
              >
                Cancelar
              </button>
              <button
                onClick={confirmEndImpersonation}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-[#00365b] rounded-lg hover:bg-[#00365b]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00365b] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Terminando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RoleSwitcher;