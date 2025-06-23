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
  Settings
} from 'lucide-react';
import { ROLE_NAMES } from '../../types/roles';

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
  created_at?: string;
}

interface UnifiedUserManagementProps {
  users: UserType[];
  onApprove: (userId: string) => void;
  onReject: (userId: string) => void;
  onDelete: (user: UserType) => void;
  onRoleChange: (user: UserType) => void;
  onAssign: (user: UserType) => void;
  onPasswordReset: (user: UserType) => void;
  onAddUser: () => void;
}

export default function UnifiedUserManagement({
  users,
  onApprove,
  onReject,
  onDelete,
  onRoleChange,
  onAssign,
  onPasswordReset,
  onAddUser
}: UnifiedUserManagementProps) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'approved'>('all');
  
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
    if (user.user_roles && user.user_roles.length > 0) {
      const primaryRole = user.user_roles[0];
      return ROLE_NAMES[primaryRole.role_type as keyof typeof ROLE_NAMES] || primaryRole.role_type;
    }
    if (user.role) {
      return user.role === 'admin' ? 'Administrador' : user.role === 'docente' ? 'Docente' : user.role;
    }
    return 'Sin rol';
  };

  const getUserPrimaryRole = (user: UserType) => {
    if (user.user_roles && user.user_roles.length > 0) {
      return user.user_roles[0].role_type;
    }
    return user.role || null;
  };

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
      lider_comunidad: 'bg-purple-50 text-purple-700 border-purple-200',
      lider_generacion: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      equipo_directivo: 'bg-orange-50 text-orange-700 border-orange-200'
    };
    return colors[role] || 'bg-gray-50 text-gray-700 border-gray-200';
  };

  // Filter users
  const filteredUsers = users.filter(user => {
    const matchesStatus = selectedStatus === 'all' || user.approval_status === selectedStatus;
    
    if (!searchQuery.trim()) return matchesStatus;
    
    const searchLower = searchQuery.toLowerCase();
    const userName = getUserName(user).toLowerCase();
    const userEmail = user.email.toLowerCase();
    const userSchool = getUserPrimarySchool(user).toLowerCase();
    
    return matchesStatus && (
      userName.includes(searchLower) ||
      userEmail.includes(searchLower) ||
      userSchool.includes(searchLower)
    );
  });

  const stats = {
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
              onClick={onAddUser}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-[#00365b] hover:bg-[#002844] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00365b] transition-colors"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Nuevo Usuario
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            onClick={() => setSelectedStatus('pending')}
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
            onClick={() => setSelectedStatus('approved')}
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
            onClick={() => setSelectedStatus('all')}
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

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-[#00365b] focus:border-[#00365b] text-sm"
            placeholder="Buscar por nombre, email o escuela..."
          />
        </div>
      </div>

      {/* Users List */}
      <div className="space-y-3">
        {filteredUsers.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No se encontraron usuarios</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery ? 'Intenta con otros términos de búsqueda' : 'No hay usuarios en esta categoría'}
            </p>
          </div>
        ) : (
          filteredUsers.map((user) => (
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
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRoleChange(user);
                              }}
                              className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00365b]"
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
                                className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00365b]"
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
                              className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00365b]"
                            >
                              <Key className="w-4 h-4 mr-2" />
                              Restablecer Contraseña
                            </button>
                          </>
                        )}
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`¿Estás seguro de que deseas eliminar a ${getUserName(user)}?`)) {
                              onDelete(user);
                            }
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
                   (user.student_assignments && user.student_assignments.length > 0) ? (
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
                        <div>
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
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}