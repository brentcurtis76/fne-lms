import { useSupabaseClient } from '@supabase/auth-helpers-react';
/**
 * Role Assignment Modal for FNE LMS 6-Role System
 * Allows admins to assign/remove roles from users
 */

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Users, Building, Users as Team, Edit } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { 
  UserRoleType, 
  ROLE_NAMES, 
  ROLE_DESCRIPTIONS,
  UserRole,
  School,
  Generation,
  GrowthCommunity 
} from '../types/roles';
import { assignRole, removeRole, getUserRoles, getAvailableCommunitiesForAssignment } from '../utils/roleUtils';

interface RoleAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  userEmail: string;
  currentUserId: string;
  onRoleUpdate: () => void;
}

export default function RoleAssignmentModal({
  isOpen,
  onClose,
  userId,
  userName,
  userEmail,
  currentUserId,
  onRoleUpdate
}: RoleAssignmentModalProps) {
  const supabase = useSupabaseClient();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [communities, setCommunities] = useState<GrowthCommunity[]>([]);
  const [availableCommunities, setAvailableCommunities] = useState<GrowthCommunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRoleType>('docente');
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [selectedGeneration, setSelectedGeneration] = useState<string>('');
  const [selectedCommunity, setSelectedCommunity] = useState<string>('');
  const [editingRole, setEditingRole] = useState<UserRole | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedRoleForView, setSelectedRoleForView] = useState<UserRole | null>(null);
  const [isViewing, setIsViewing] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<UserRole | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNewRoleForm, setShowNewRoleForm] = useState(false);

  // Available role types
  const availableRoles: UserRoleType[] = [
    'admin',
    'consultor', 
    'equipo_directivo',
    'lider_generacion',
    'lider_comunidad',
    'docente'
  ];

  useEffect(() => {
    if (isOpen) {
      loadData();
      // Reset to default state when opening
      setShowNewRoleForm(false);
      setIsViewing(false);
      setIsEditing(false);
      setSelectedRoleForView(null);
    }
  }, [isOpen, userId]);

  // Reload communities when school selection changes
  useEffect(() => {
    const loadCommunitiesForSchool = async () => {
      if (selectedSchool) {
        console.log('Loading communities for school:', selectedSchool);
        const comms = await getAvailableCommunitiesForAssignment(supabase, selectedSchool);
        setAvailableCommunities(comms);
        console.log('Communities loaded for school', selectedSchool, ':', comms);
      } else {
        // Load all communities if no school selected
        const comms = await getAvailableCommunitiesForAssignment(supabase);
        setAvailableCommunities(comms);
        console.log('All communities loaded:', comms);
      }
    };

    if (isOpen) {
      loadCommunitiesForSchool();
    }
  }, [selectedSchool, isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load user's current roles
      const roles = await getUserRoles(supabase, userId);
      setUserRoles(roles);
      
      // If user has roles, select the first one by default
      if (roles.length > 0) {
        setSelectedRoleForView(roles[0]);
        setIsViewing(true);
      }

      // Load organizational data
      const [schoolsResult, generationsResult, communitiesResult] = await Promise.all([
        supabase.from('schools').select('*').order('name'),
        supabase.from('generations').select('*, school:schools(*)').order('name'),
        supabase.from('growth_communities').select('*, generation:generations(*), school:schools(*)').order('name')
      ]);

      if (schoolsResult.data) setSchools(schoolsResult.data);
      if (generationsResult.data) setGenerations(generationsResult.data);
      if (communitiesResult.data) setCommunities(communitiesResult.data);
      
      // Initially load all communities
      const allComms = await getAvailableCommunitiesForAssignment(supabase);
      setAvailableCommunities(allComms);
      console.log('Initial available communities:', allComms);
      console.log('Schools data:', schoolsResult.data);

      // Don't set a default school - let user choose
      // This ensures all communities are visible initially
      setSelectedSchool('');

    } catch (error) {
      console.error('Error loading role assignment data:', error);
      toast.error('Error al cargar datos de roles');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRole = async () => {
    try {
      setLoading(true);

      // Validation: Don't allow generation leader role for schools without generations
      if (selectedRole === 'lider_generacion' && selectedSchool) {
        const school = schools.find(s => s.id === selectedSchool);
        if (school?.has_generations === false) {
          toast.error('No se puede asignar Líder de Generación en escuelas sin generaciones');
          setLoading(false);
          return;
        }
      }

      const organizationalScope = {
        schoolId: selectedSchool || undefined,
        generationId: selectedGeneration || undefined,
        communityId: selectedCommunity || undefined
      };

      const result = await assignRole(supabase, userId, selectedRole, currentUserId, organizationalScope);
      
      if (result.success) {
        if (selectedRole === 'lider_comunidad' && result.communityId) {
          toast.success('Rol asignado y comunidad creada correctamente');
        } else {
          toast.success('Rol asignado correctamente');
        }
        await loadData(); // Refresh roles
        onRoleUpdate(); // Notify parent component
        
        // Reset form
        setSelectedRole('docente');
        setSelectedGeneration('');
        setSelectedCommunity('');
        setShowNewRoleForm(false);
      } else {
        toast.error(result.error || 'Error al asignar rol');
      }
    } catch (error) {
      console.error('Error assigning role:', error);
      toast.error('Error inesperado al asignar rol');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    try {
      setLoading(true);
      
      const result = await removeRole(supabase, roleId, currentUserId);
      
      if (result.success) {
        toast.success('Rol removido correctamente');
        await loadData(); // Refresh roles
        onRoleUpdate(); // Notify parent component
        setShowDeleteConfirm(false);
        setRoleToDelete(null);
      } else {
        toast.error(result.error || 'Error al remover rol');
      }
    } catch (error) {
      console.error('Error removing role:', error);
      toast.error('Error inesperado al remover rol');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (role: UserRole) => {
    setRoleToDelete(role);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (roleToDelete) {
      handleRemoveRole(roleToDelete.id);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setRoleToDelete(null);
  };

  const handleViewRole = (role: UserRole) => {
    setSelectedRoleForView(role);
    setIsViewing(true);
    setIsEditing(false);
    setEditingRole(null);
  };

  const handleEditRole = (role: UserRole) => {
    setEditingRole(role);
    setIsEditing(true);
    setIsViewing(false);
    setSelectedRoleForView(null);
    setSelectedRole(role.role_type);
    setSelectedSchool(role.school_id || '');
    setSelectedGeneration(role.generation_id || '');
    setSelectedCommunity(role.community_id || '');
  };

  const handleStartNewRole = () => {
    setIsViewing(false);
    setIsEditing(false);
    setSelectedRoleForView(null);
    setEditingRole(null);
    setSelectedRole('docente');
    setSelectedSchool('');
    setSelectedGeneration('');
    setSelectedCommunity('');
    setShowNewRoleForm(true);
  };

  const handleUpdateRole = async () => {
    if (!editingRole) return;

    try {
      setLoading(true);

      // First remove the old role
      const removeResult = await removeRole(supabase, editingRole.id, currentUserId);
      if (!removeResult.success) {
        toast.error(removeResult.error || 'Error al actualizar rol');
        return;
      }

      // Then create the updated role
      const organizationalScope = {
        schoolId: selectedSchool || undefined,
        generationId: selectedGeneration || undefined,
        communityId: selectedCommunity || undefined
      };

      const assignResult = await assignRole(supabase, userId, selectedRole, currentUserId, organizationalScope);
      
      if (assignResult.success) {
        toast.success('Rol actualizado correctamente');
        await loadData(); // Refresh roles
        onRoleUpdate(); // Notify parent component
        
        // Reset edit mode
        setIsEditing(false);
        setEditingRole(null);
        setSelectedRole('docente');
        setSelectedSchool('');
        setSelectedGeneration('');
        setSelectedCommunity('');
      } else {
        toast.error(assignResult.error || 'Error al actualizar rol');
      }
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Error inesperado al actualizar rol');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingRole(null);
    setSelectedRole('docente');
    setSelectedSchool('');
    setSelectedGeneration('');
    setSelectedCommunity('');
  };

  const getRoleDisplayInfo = (role: UserRole) => {
    let scopeInfo = '';
    if (role.school?.name) {
      scopeInfo += role.school.name;
      if (role.generation?.name) {
        scopeInfo += ` > ${role.generation.name}`;
        if (role.community?.name) {
          scopeInfo += ` > ${role.community.name}`;
        }
      }
    }
    return scopeInfo || 'Sin ámbito específico';
  };

  const getRoleIcon = (roleType: UserRoleType) => {
    // No icons - clean professional look
    return '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-[#00365b]">Gestión de Roles</h2>
            <p className="text-gray-600">
              {userName} ({userEmail})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00365b]"></div>
              <span className="ml-2 text-gray-600">Cargando...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Current Roles */}
              <div>
                <h3 className="text-lg font-semibold text-[#00365b] mb-4 flex items-center">
                  <Users className="mr-2" size={20} />
                  Roles Actuales
                </h3>
                
                {userRoles.length === 0 ? (
                  <div className="text-gray-500 text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                    Este usuario no tiene roles asignados
                  </div>
                ) : (
                  <div className="space-y-3">
                    {userRoles.map((role) => (
                      <div
                        key={role.id}
                        className={`flex items-center justify-between p-4 rounded-lg border transition-all cursor-pointer ${
                          selectedRoleForView?.id === role.id 
                            ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-100' 
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                        onClick={() => handleViewRole(role)}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-3 h-3 rounded-full ${
                            selectedRoleForView?.id === role.id ? 'bg-blue-600' : 'bg-[#00365b]'
                          }`}></div>
                          <div>
                            <div className={`font-medium ${
                              selectedRoleForView?.id === role.id ? 'text-blue-700' : 'text-[#00365b]'
                            }`}>
                              {ROLE_NAMES[role.role_type]}
                            </div>
                            <div className="text-sm text-gray-600">
                              {getRoleDisplayInfo(role)}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditRole(role);
                            }}
                            className="text-[#00365b] hover:text-blue-800 transition-colors p-1"
                            title="Editar rol"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(role);
                            }}
                            className="text-red-600 hover:text-red-800 transition-colors p-1"
                            title="Remover rol"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* View Role, Edit Role, or Assign New Role */}
              <div>
                {userRoles.length === 0 && !showNewRoleForm ? (
                  // Empty state when user has no roles
                  <div className="text-center py-8">
                    <Users className="mx-auto text-gray-400 mb-4" size={48} />
                    <p className="text-gray-600 mb-4">Este usuario no tiene roles asignados</p>
                    <button
                      onClick={handleStartNewRole}
                      className="bg-[#fdb933] text-white px-4 py-2 rounded-lg hover:bg-[#e6a530] transition-colors"
                    >
                      + Asignar Primer Rol
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-[#00365b] flex items-center">
                        {isViewing ? (
                          <>
                            <Users className="mr-2" size={20} />
                            Detalles del Rol
                          </>
                        ) : isEditing ? (
                          <>
                            <Edit className="mr-2" size={20} />
                            Editar Rol
                          </>
                        ) : showNewRoleForm ? (
                          <>
                            <Plus className="mr-2" size={20} />
                            Asignar Nuevo Rol
                          </>
                        ) : null}
                      </h3>
                      {(isViewing || isEditing) && (
                        <button
                          onClick={handleStartNewRole}
                          className="text-sm bg-[#fdb933] text-white px-3 py-1 rounded-lg hover:bg-[#e6a530] transition-colors"
                        >
                          + Nuevo Rol
                        </button>
                      )}
                    </div>

                    <div className="space-y-4">
                      {/* View Mode - Show role details */}
                      {isViewing && selectedRoleForView && (
                        <div className="space-y-4">
                          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold text-blue-900">
                                {ROLE_NAMES[selectedRoleForView.role_type]}
                              </h4>
                              <button
                                onClick={() => handleEditRole(selectedRoleForView)}
                                className="text-sm bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition-colors"
                              >
                                Editar
                              </button>
                            </div>
                            <p className="text-sm text-blue-800 mb-4">
                              {ROLE_DESCRIPTIONS[selectedRoleForView.role_type]}
                            </p>
                            
                            <div className="space-y-3">
                              {selectedRoleForView.school && (
                                <div className="flex items-center text-sm">
                                  <Building className="mr-2" size={16} />
                                  <span className="font-medium">Colegio:</span>
                                  <span className="ml-2 text-gray-700">{selectedRoleForView.school.name}</span>
                                </div>
                              )}
                              
                              {selectedRoleForView.generation && (
                                <div className="flex items-center text-sm">
                                  <Team className="mr-2" size={16} />
                                  <span className="font-medium">Generación:</span>
                                  <span className="ml-2 text-gray-700">
                                    {selectedRoleForView.generation.name} ({selectedRoleForView.generation.grade_range})
                                  </span>
                                </div>
                              )}
                              
                              {selectedRoleForView.community && (
                                <div className="flex items-center text-sm">
                                  <Users className="mr-2" size={16} />
                                  <span className="font-medium">Comunidad:</span>
                                  <span className="ml-2 text-gray-700">{selectedRoleForView.community.name}</span>
                                </div>
                              )}
                              
                              {!selectedRoleForView.school && !selectedRoleForView.generation && !selectedRoleForView.community && (
                                <div className="text-sm text-gray-600 italic">
                                  Sin ámbito organizacional específico
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Edit/New Role Mode - Show form fields */}
                      {(isEditing || showNewRoleForm) && (
                        <>
                          {/* Role Selection */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Tipo de Rol
                            </label>
                            <select
                              value={selectedRole}
                              onChange={(e) => setSelectedRole(e.target.value as UserRoleType)}
                              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                            >
                              {availableRoles.map((roleType) => (
                                <option key={roleType} value={roleType}>
                                  {ROLE_NAMES[roleType]}
                                </option>
                              ))}
                            </select>
                            <p className="text-sm text-gray-600 mt-1">
                              {ROLE_DESCRIPTIONS[selectedRole]}
                            </p>
                          </div>

                          {/* Organizational Scope (now available for ALL roles) */}
                          <>
                            {/* School Selection */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                <Building className="inline mr-1" size={16} />
                                Colegio {selectedRole === 'admin' ? '(Opcional)' : ''}
                              </label>
                              <select
                                value={selectedSchool}
                                onChange={(e) => {
                                  const newSchoolId = e.target.value;
                                  setSelectedSchool(newSchoolId);
                                  console.log('School selection changed to:', newSchoolId);
                                  console.log('Available communities for filtering:', availableCommunities);
                                }}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                              >
                                <option value="">{selectedRole === 'admin' ? 'Sin colegio específico' : 'Seleccionar colegio'}</option>
                                {schools.map((school) => (
                                  <option key={school.id} value={school.id}>
                                    {school.name}
                                  </option>
                                ))}
                              </select>
                              {selectedRole === 'admin' && (
                                <p className="text-xs text-gray-600 mt-1">
                                  Los administradores pueden opcionalmente asociarse a un colegio específico
                                </p>
                              )}
                            </div>

                            {/* Generation Selection (for generation/community roles - only show if school has generations) */}
                            {(['lider_generacion', 'lider_comunidad'].includes(selectedRole)) && (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  <Team className="inline mr-1" size={16} />
                                  Generación {selectedRole === 'lider_comunidad' && selectedSchool && schools.find(s => s.id === selectedSchool)?.has_generations === false ? '(Opcional)' : ''}
                                </label>
                                {/* Check if selected school has generations */}
                                {selectedSchool && schools.find(s => s.id === selectedSchool)?.has_generations === false ? (
                                  <>
                                    {selectedRole === 'lider_generacion' ? (
                                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                        <p className="text-sm text-yellow-800">
                                          Esta escuela no utiliza generaciones. No se puede asignar el rol de Líder de Generación.
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                        <p className="text-sm text-blue-800">
                                          Esta escuela no utiliza generaciones. La comunidad se creará directamente bajo la escuela.
                                        </p>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <select
                                    value={selectedGeneration}
                                    onChange={(e) => setSelectedGeneration(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                                  >
                                    <option value="">Seleccionar generación</option>
                                    {generations
                                      .filter(gen => !selectedSchool || gen.school_id === selectedSchool)
                                      .map((generation) => (
                                        <option key={generation.id} value={generation.id}>
                                          {generation.name} ({generation.grade_range})
                                        </option>
                                      ))}
                                  </select>
                                )}
                              </div>
                            )}

                            {/* Community Selection - Now available for ALL roles */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                <Users className="inline mr-1" size={16} />
                                {selectedRole === 'lider_comunidad' ? 'Nueva Comunidad (se creará automáticamente)' : 'Comunidad de Crecimiento (Opcional)'}
                              </label>
                              {selectedRole === 'lider_comunidad' ? (
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                  <p className="text-sm text-blue-800">
                                    Se creará automáticamente una nueva comunidad con el nombre del líder
                                  </p>
                                </div>
                              ) : (
                                <>
                                  <select
                                    value={selectedCommunity}
                                    onChange={(e) => setSelectedCommunity(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                                  >
                                    <option value="">Sin asignar a comunidad específica</option>
                                    {availableCommunities
                                      .filter(comm => {
                                        // If a school is selected, filter by school
                                        // Convert selectedSchool to integer to match database type
                                        if (selectedSchool) {
                                          const schoolIdInt = parseInt(selectedSchool);
                                          if (!isNaN(schoolIdInt)) {
                                            const schoolMatch = comm.school_id === String(schoolIdInt);
                                            if (!schoolMatch) return false;
                                          } else {
                                            // If selectedSchool is not a valid integer, no match
                                            return false;
                                          }
                                        }
                                        
                                        // If a generation is selected AND the school has generations, filter by generation
                                        if (selectedGeneration) {
                                          const generationMatch = comm.generation_id === selectedGeneration;
                                          if (!generationMatch) return false;
                                        }
                                        
                                        // If no generation is selected but school is selected, 
                                        // show all communities for that school (including those without generations)
                                        return true;
                                      })
                                      .map((community) => (
                                        <option key={community.id} value={community.id}>
                                          {community.name}
                                        </option>
                                      ))}
                                  </select>
                                  <p className="text-xs text-gray-600 mt-1">
                                    Todos los roles pueden pertenecer a una comunidad de crecimiento para colaboración y reportes
                                  </p>
                                </>
                              )}
                            </div>
                          </>

                          {/* Action Buttons */}
                          {isEditing ? (
                            <div className="space-y-3">
                              <button
                                onClick={handleUpdateRole}
                                disabled={loading}
                                className="w-full bg-[#fdb933] text-white py-3 px-4 rounded-lg hover:bg-[#e6a530] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                              >
                                {loading ? 'Actualizando...' : 'Actualizar Rol'}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                disabled={loading}
                                className="w-full bg-gray-300 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : showNewRoleForm ? (
                            <button
                              onClick={handleAssignRole}
                              disabled={loading}
                              className="w-full bg-[#fdb933] text-white py-3 px-4 rounded-lg hover:bg-[#e6a530] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                            >
                              {loading ? 'Asignando...' : 'Asignar Rol'}
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && roleToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-60">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mr-3">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Confirmar Eliminación</h3>
                  <p className="text-sm text-gray-600">Esta acción no se puede deshacer</p>
                </div>
              </div>
              
              <div className="mb-6">
                <p className="text-gray-700">
                  ¿Estás seguro de que deseas eliminar el rol <strong>{ROLE_NAMES[roleToDelete.role_type]}</strong>?
                </p>
                {roleToDelete.role_type === 'admin' && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>Advertencia:</strong> Eliminar un rol de administrador puede limitar el acceso a funciones críticas del sistema.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={handleConfirmDelete}
                  disabled={loading}
                  className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {loading ? 'Eliminando...' : 'Eliminar Rol'}
                </button>
                <button
                  onClick={handleCancelDelete}
                  disabled={loading}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}