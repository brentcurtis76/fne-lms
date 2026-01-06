import React, { useState } from 'react';
import { 
  Search, 
  ChevronDown,
  ChevronRight,
  CheckCircle, 
  XCircle, 
  Clock,
  Users,
  UserPlus,
  Mail,
  Building,
  Shield,
  Key,
  Trash2,
  Download,
  Filter,
  User,
  Settings,
  Upload,
  Edit,
  Loader2,
  X
} from 'lucide-react';
import { toastSuccess, toastError } from '../../utils/toastUtils';
import { TOAST_MESSAGES } from '../../constants/toastMessages';
import { ROLE_NAMES } from '../../types/roles';
import { getHighestRole } from '../../utils/roleUtils';
import { ConfirmModal } from '../common/ConfirmModal';

interface UserType {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  role?: string;
  school?: string;
  school_relation?: any;
  user_roles?: any[];
  consultant_assignments?: any[];
  student_assignments?: any[];
  course_assignments?: any[];
  learning_path_assignments?: any[];
  created_at?: string;
  expense_access_enabled?: boolean;
  is_global_admin?: boolean;
}

interface UnifiedUserManagementProps {
  users: UserType[];
  summary?: { total: number; pending: number; approved: number };
  schools?: Array<{ id: string; name: string }>;
  searchQuery: string;
  selectedStatus: 'all' | 'pending' | 'approved';
  selectedSchoolId: string;
  selectedCommunityId: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onClearSearch?: () => void;
  onStatusChange: (value: 'all' | 'pending' | 'approved') => void;
  onSchoolChange: (value: string) => void;
  onCommunityChange: (value: string) => void;
  onApprove: (userId: string) => void;
  onReject: (userId: string) => void;
  onDelete: (user: UserType) => void;
  onRoleChange: (user: UserType) => void;
  onAssign: (user: UserType) => void;
  onPasswordReset: (user: UserType) => void;
  onExpenseAccessToggle: (user: UserType, enable: boolean) => void;
  onAddUser: () => void;
  onBulkImport: () => void;
  onEditUser: (user: UserType) => void;
  isLoading?: boolean;
  expenseAccessUpdating?: Record<string, boolean>;
}

export const resolvePrimaryRole = (user: UserType): string | null => {
  const highestRole = getHighestRole(user.user_roles || []);
  if (highestRole) {
    return highestRole;
  }
  if (user.role) {
    return user.role;
  }
  return null;
};

export default function UnifiedUserManagement({
  users,
  summary,
  schools = [],
  searchQuery,
  selectedStatus,
  selectedSchoolId,
  selectedCommunityId,
  onSearchChange,
  onSearchSubmit,
  onClearSearch,
  onStatusChange,
  onSchoolChange,
  onCommunityChange,
  onApprove,
  onReject,
  onDelete,
  onRoleChange,
  onAssign,
  onPasswordReset,
  onExpenseAccessToggle,
  onAddUser,
  onBulkImport,
  onEditUser,
  isLoading,
  expenseAccessUpdating = {}
}: UnifiedUserManagementProps) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; user: UserType | null }>({
    isOpen: false,
    user: null
  });
  
  // Helper functions
  const getUserName = (user: UserType) => {
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    return 'Sin nombre';
  };

  const getUserPrimarySchool = (user: UserType) => {
    if (user.user_roles && user.user_roles.length > 0) {
      const roleWithSchool = user.user_roles.find((role: any) => role.school?.name);
      if (roleWithSchool) {
        return roleWithSchool.school.name;
      }
    }
    if (user.school_relation?.name) {
      return user.school_relation.name;
    }
    return user.school || 'Sin escuela';
  };

  const getRoleDisplayName = (user: UserType) => {
    const primaryRole = resolvePrimaryRole(user);
    if (primaryRole) {
      return ROLE_NAMES[primaryRole as keyof typeof ROLE_NAMES] || primaryRole;
    }
    return 'Sin rol';
  };

  const getUserPrimaryRole = (user: UserType) => resolvePrimaryRole(user);

  const getAssignmentCount = (user: UserType) => {
    let count = 0;
    if (user.consultant_assignments) count += user.consultant_assignments.length;
    if (user.student_assignments) count += user.student_assignments.length;
    return count;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-amber-500" />;
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-red-50 text-red-700 border-red-200',
      consultor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      docente: 'bg-blue-50 text-blue-700 border-blue-200',
      lider_comunidad: 'bg-amber-50 text-amber-700 border-amber-200',
      lider_generacion: 'bg-slate-50 text-slate-700 border-slate-200',
      equipo_directivo: 'bg-orange-50 text-orange-700 border-orange-200',
      supervisor_de_red: 'bg-teal-50 text-teal-700 border-teal-200'
    };
    return colors[role] || 'bg-gray-50 text-gray-700 border-gray-200';
  };


  // Get unique communities from all users, filtered by selected school
  const uniqueCommunities = (() => {
    const communitiesMap = new Map();
    users.forEach(user => {
      if (user.user_roles && user.user_roles.length > 0) {
        user.user_roles.forEach((role: any) => {
          if (role.community?.id && role.community?.name) {
            // If a school is selected, only include communities from that school
            if (selectedSchoolId) {
              const communitySchoolId = role.community?.school?.id?.toString() || role.school?.id?.toString();
              if (communitySchoolId === selectedSchoolId) {
                communitiesMap.set(role.community.id, role.community.name);
              }
            } else {
              communitiesMap.set(role.community.id, role.community.name);
            }
          }
        });
      }
    });
    return Array.from(communitiesMap, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  })();

  const stats = summary ?? {
    pending: users.filter(u => u.approval_status === 'pending').length,
    approved: users.filter(u => u.approval_status === 'approved').length,
    total: users.length
  };

  const toggleExpanded = (userId: string) => {
    setExpandedUserId(expandedUserId === userId ? null : userId);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h1>
            <p className="mt-2 text-sm text-gray-600">
              Administra los usuarios y permisos del sistema
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex gap-3">
            <button 
              onClick={onBulkImport}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a] transition-colors"
            >
              <Upload className="w-4 h-4 mr-2" />
              Importar Usuarios
            </button>
            <button 
              onClick={onAddUser}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-[#0a0a0a] hover:bg-[#002844] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a] transition-colors"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Nuevo Usuario
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            onClick={() => onStatusChange('pending')}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedStatus === 'pending' 
                ? 'border-amber-500 bg-amber-50' 
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-amber-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Pendientes</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
                </div>
              </div>
            </div>
          </button>

          <button
            onClick={() => onStatusChange('approved')}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedStatus === 'approved' 
                ? 'border-green-500 bg-green-50' 
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Aprobados</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.approved}</p>
                </div>
              </div>
            </div>
          </button>

          <button
            onClick={() => onStatusChange('all')}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedStatus === 'all' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-blue-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Total</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSubmit();
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-[#0a0a0a] focus:border-[#0a0a0a] text-sm"
              placeholder="Buscar por nombre, email o escuela..."
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[#0a0a0a] text-white text-sm font-medium hover:bg-[#002844] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Buscar
            </button>
            {searchQuery && onClearSearch && (
              <button
                type="button"
                onClick={onClearSearch}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <X className="w-4 h-4 mr-2" />
                Limpiar
              </button>
            )}
          </div>
        </form>

        {/* School and Community Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* School Filter */}
          {schools.length > 0 && (
            <div>
              <label htmlFor="school-filter" className="block text-sm font-medium text-gray-700 mb-1">
                Filtrar por Colegio
              </label>
              <select
                id="school-filter"
                value={selectedSchoolId || ''}
                onChange={(e) => onSchoolChange(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-[#0a0a0a]"
              >
                <option value="">Todos los colegios</option>
                {schools.map(school => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Community Filter */}
          {uniqueCommunities.length > 0 && (
            <div>
              <label htmlFor="community-filter" className="block text-sm font-medium text-gray-700 mb-1">
                Filtrar por Comunidad
              </label>
              <select
                id="community-filter"
                value={selectedCommunityId || ''}
                onChange={(e) => onCommunityChange(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-[#0a0a0a]"
              >
                <option value="">Todas las comunidades</option>
                {uniqueCommunities.map(community => (
                  <option key={community.id} value={community.id}>
                    {community.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Users List */}
      <div className="space-y-3">
        {users.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No se encontraron usuarios</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery ? 'Intenta con otros términos de búsqueda' : 'No hay usuarios en esta categoría'}
            </p>
          </div>
        ) : (
          users.map((user) => {
            const primaryRole = getUserPrimaryRole(user);
            const isAdminRole = Boolean(user.is_global_admin || primaryRole === 'admin');
            const expenseEnabled = isAdminRole ? true : !!user.expense_access_enabled;
            const isUpdatingExpense = !!expenseAccessUpdating[user.id];

            return (
            <div key={user.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* User Row */}
              <div
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => toggleExpanded(user.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {/* Expand Icon */}
                    <div className="flex-shrink-0">
                      {expandedUserId === user.id ? (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                    </div>

                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-600">
                          {getUserName(user).split(' ').filter(n => n).map(n => n[0]).join('').toUpperCase() || '?'}
                        </span>
                      </div>
                    </div>

                    {/* User Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-sm font-medium text-gray-900 truncate">
                          {getUserName(user)}
                        </h3>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(getUserPrimaryRole(user) || '')}`}>
                          {getRoleDisplayName(user)}
                        </span>
                        {getAssignmentCount(user) > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {getAssignmentCount(user)} asignaciones
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                        <span className="flex items-center">
                          <Mail className="w-4 h-4 mr-1" />
                          {user.email}
                        </span>
                        <span className="flex items-center">
                          <Building className="w-4 h-4 mr-1" />
                          {getUserPrimarySchool(user)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center">
                    {getStatusIcon(user.approval_status)}
                    <span className={`ml-2 text-sm font-medium ${
                      user.approval_status === 'pending' ? 'text-amber-600' :
                      user.approval_status === 'approved' ? 'text-green-600' :
                      'text-red-600'
                    }`}>
                      {user.approval_status === 'pending' ? 'Pendiente' :
                       user.approval_status === 'approved' ? 'Aprobado' :
                       'Rechazado'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedUserId === user.id && (
                <div className="border-t border-gray-200 bg-gray-50 p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* User Details */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Detalles del Usuario</h4>
                      <dl className="space-y-2">
                        <div>
                          <dt className="text-sm text-gray-500">Fecha de registro</dt>
                          <dd className="text-sm text-gray-900">
                            {user.created_at ? new Date(user.created_at).toLocaleDateString('es-ES') : 'No disponible'}
                          </dd>
                        </div>
                        {user.user_roles && user.user_roles.length > 0 && (
                          <div>
                            <dt className="text-sm text-gray-500">Roles asignados</dt>
                            <dd className="mt-1 space-y-1">
                              {user.user_roles.map((role: any, index: number) => (
                                <div key={index} className="text-sm text-gray-900">
                                  {ROLE_NAMES[role.role_type as keyof typeof ROLE_NAMES] || role.role_type}
                                  {role.school?.name && ` - ${role.school.name}`}
                                  {role.role_type === 'supervisor_de_red' && role.network?.name && (
                                    <span className="text-teal-600"> - Red: {role.network.name}</span>
                                  )}
                                </div>
                              ))}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    {/* Actions */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Acciones</h4>
                      <div className="space-y-2">
                        {user.approval_status === 'pending' && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onApprove(user.id);
                              }}
                              className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Aprobar Usuario
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onReject(user.id);
                              }}
                              className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              Rechazar Usuario
                            </button>
                          </>
                        )}
                        
                        {user.approval_status === 'approved' && (
                          <>
                            <div className="border border-gray-200 rounded-md p-3">
                              <div className="text-xs font-medium text-gray-600 mb-2">Reportes de gastos</div>
                              {isAdminRole ? (
                                <span className="text-sm text-green-700">Admin - acceso total</span>
                              ) : (
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-sm text-gray-700">
                                    {expenseEnabled ? 'Habilitado' : 'Bloqueado'}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onExpenseAccessToggle(user, !expenseEnabled);
                                    }}
                                    disabled={isUpdatingExpense}
                                    className={`flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition ${
                                      expenseEnabled
                                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                    } ${isUpdatingExpense ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                  >
                                    {isUpdatingExpense && (
                                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                    )}
                                    {expenseEnabled ? 'Deshabilitar' : 'Habilitar'}
                                  </button>
                                </div>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditUser(user);
                              }}
                              className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a]"
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Editar Usuario
                            </button>
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRoleChange(user);
                              }}
                              className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a]"
                            >
                              <Shield className="w-4 h-4 mr-2" />
                              Gestionar Roles
                            </button>
                            
                            {getUserPrimaryRole(user) === 'consultor' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAssign(user);
                                }}
                                className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a]"
                              >
                                <Users className="w-4 h-4 mr-2" />
                                Asignar Estudiantes
                              </button>
                            )}
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onPasswordReset(user);
                              }}
                              className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a]"
                            >
                              <Key className="w-4 h-4 mr-2" />
                              Restablecer Contraseña
                            </button>
                          </>
                        )}
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ isOpen: true, user });
                          }}
                          className="w-full flex items-center justify-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Eliminar Usuario
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Assignments Section */}
                  {(user.consultant_assignments && user.consultant_assignments.length > 0) ||
                   (user.student_assignments && user.student_assignments.length > 0) ||
                   (user.course_assignments && user.course_assignments.length > 0) ||
                   (user.learning_path_assignments && user.learning_path_assignments.length > 0) ? (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Asignaciones</h4>
                      
                      {user.consultant_assignments && user.consultant_assignments.length > 0 && (
                        <div className="mb-3">
                          <h5 className="text-xs font-medium text-gray-700 mb-1">Como Consultor:</h5>
                          <div className="space-y-1">
                            {user.consultant_assignments.map((assignment: any, index: number) => (
                              <div key={index} className="text-sm text-gray-600">
                                • {assignment.student?.first_name} {assignment.student?.last_name} - 
                                {assignment.assignment_type === 'monitoring' ? ' Monitoreo' : 
                                 assignment.assignment_type === 'mentoring' ? ' Mentoría' :
                                 assignment.assignment_type === 'evaluation' ? ' Evaluación' :
                                 assignment.assignment_type === 'support' ? ' Apoyo' :
                                 assignment.assignment_type === 'comprehensive' ? ' Completa' :
                                 ` ${assignment.assignment_type}`}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {user.student_assignments && user.student_assignments.length > 0 && (
                        <div className="mb-3">
                          <h5 className="text-xs font-medium text-gray-700 mb-1">Como Estudiante:</h5>
                          <div className="space-y-1">
                            {user.student_assignments.map((assignment: any, index: number) => (
                              <div key={index} className="text-sm text-gray-600">
                                • Consultor: {assignment.consultant?.first_name} {assignment.consultant?.last_name}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {user.course_assignments && user.course_assignments.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-gray-700 mb-1">Cursos Asignados ({user.course_assignments.length}):</h5>
                          <div className="space-y-1">
                            {user.course_assignments.map((assignment: any, index: number) => (
                              <div key={index} className="text-sm text-gray-600">
                                • {assignment.course?.title || 'Curso sin título'}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {user.learning_path_assignments && user.learning_path_assignments.length > 0 && (
                        <div className="mt-3">
                          <h5 className="text-xs font-medium text-gray-700 mb-1">Rutas de Aprendizaje Asignadas ({user.learning_path_assignments.length}):</h5>
                          <div className="space-y-1">
                            {user.learning_path_assignments.map((assignment: any, index: number) => (
                              <div key={index} className="text-sm text-gray-600">
                                • {assignment.path?.name || 'Ruta sin título'}
                                {assignment.path?.description && (
                                  <span className="ml-1 text-gray-500">({assignment.path.description})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
          })
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, user: null })}
        onConfirm={() => {
          if (deleteConfirm.user) {
            onDelete(deleteConfirm.user);
            toastSuccess(TOAST_MESSAGES.CRUD.DELETE_SUCCESS('Usuario'));
          }
        }}
        title="Eliminar Usuario"
        message={`¿Estás seguro de que deseas eliminar a ${deleteConfirm.user ? getUserName(deleteConfirm.user) : ''}?`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDangerous={true}
      />
    </div>
  );
}
