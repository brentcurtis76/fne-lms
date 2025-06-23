import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  MoreVertical, 
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
  ChevronDown,
  Download,
  RefreshCw
} from 'lucide-react';
import { ROLE_NAMES } from '../../types/roles';

interface User {
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

interface ModernUserManagementProps {
  users: User[];
  onApprove: (userId: string) => void;
  onReject: (userId: string) => void;
  onDelete: (userId: string) => void;
  onRoleChange: (user: User) => void;
  onAssign: (user: User) => void;
  onPasswordReset: (user: User) => void;
  onAddUser: () => void;
}

export default function ModernUserManagement({
  users,
  onApprove,
  onReject,
  onDelete,
  onRoleChange,
  onAssign,
  onPasswordReset,
  onAddUser
}: ModernUserManagementProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  
  // Helper functions
  const getUserName = (user: User) => {
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    return 'Sin nombre';
  };

  const getUserPrimarySchool = (user: User) => {
    // First check if user has roles with schools
    if (user.user_roles && user.user_roles.length > 0) {
      // Find the first role with a school
      const roleWithSchool = user.user_roles.find((role: any) => role.school?.name);
      if (roleWithSchool) {
        return roleWithSchool.school.name;
      }
    }
    
    // Fallback to school_relation if available
    if (user.school_relation?.name) {
      return user.school_relation.name;
    }
    
    // Fallback to old text field
    return user.school || 'Sin escuela';
  };

  const getRoleDisplayName = (user: User) => {
    // Get user's primary role
    if (user.user_roles && user.user_roles.length > 0) {
      const primaryRole = user.user_roles[0];
      return ROLE_NAMES[primaryRole.role_type as keyof typeof ROLE_NAMES] || primaryRole.role_type;
    }
    
    // Fallback to legacy role
    if (user.role) {
      return user.role === 'admin' ? 'Administrador' : user.role === 'docente' ? 'Docente' : user.role;
    }
    
    return 'Sin rol';
  };

  const getUserPrimaryRole = (user: User) => {
    // Get user's primary role type
    if (user.user_roles && user.user_roles.length > 0) {
      return user.user_roles[0].role_type;
    }
    
    // Fallback to legacy role
    return user.role || null;
  };
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('date');

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getAssignmentCount = (user: User) => {
    let count = 0;
    if (user.consultant_assignments) count += user.consultant_assignments.length;
    if (user.student_assignments) count += user.student_assignments.length;
    return count;
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-red-100 text-red-700 border-red-200',
      consultor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      docente: 'bg-blue-100 text-blue-700 border-blue-200',
      lider_comunidad: 'bg-purple-100 text-purple-700 border-purple-200',
      lider_generacion: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      equipo_directivo: 'bg-orange-100 text-orange-700 border-orange-200'
    };
    return colors[role] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const filteredUsers = users.filter(user => {
    const matchesTab = activeTab === 'all' || 
      (activeTab === 'pending' && user.approval_status === 'pending') ||
      (activeTab === 'approved' && user.approval_status === 'approved');
    
    const userName = getUserName(user).toLowerCase();
    const userSchool = getUserPrimarySchool(user).toLowerCase();
    const matchesSearch = !searchQuery || 
      userName.includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      userSchool.includes(searchQuery.toLowerCase());
    
    return matchesTab && matchesSearch;
  });

  const stats = {
    pending: users.filter(u => u.approval_status === 'pending').length,
    approved: users.filter(u => u.approval_status === 'approved').length,
    total: users.length
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
            <p className="mt-1 text-sm text-gray-500">
              Administra los usuarios y permisos del sistema
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex gap-3">
            <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00365b]">
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </button>
            <button 
              onClick={onAddUser}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-[#00365b] hover:bg-[#002844] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00365b]">
              <UserPlus className="w-4 h-4 mr-2" />
              Nuevo Usuario
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="bg-white overflow-hidden rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Clock className="h-6 w-6 text-amber-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Pendientes
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.pending}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white overflow-hidden rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Aprobados
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.approved}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white overflow-hidden rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Users className="h-6 w-6 text-blue-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Usuarios
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.total}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="mb-6 space-y-4">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('pending')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'pending'
                  ? 'border-[#fdb933] text-[#00365b]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Pendientes de Aprobación
              {stats.pending > 0 && (
                <span className="ml-2 bg-amber-100 text-amber-600 py-0.5 px-2 rounded-full text-xs">
                  {stats.pending}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('approved')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'approved'
                  ? 'border-[#fdb933] text-[#00365b]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Usuarios Aprobados
              <span className="ml-2 bg-green-100 text-green-600 py-0.5 px-2 rounded-full text-xs">
                {stats.approved}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'all'
                  ? 'border-[#fdb933] text-[#00365b]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Todos los Usuarios
              <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                {stats.total}
              </span>
            </button>
          </nav>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-[#00365b] focus:border-[#00365b] sm:text-sm"
              placeholder="Buscar por nombre, email o escuela..."
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtros
            <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          {selectedUsers.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {selectedUsers.size} seleccionados
              </span>
              <button className="text-sm text-[#00365b] hover:text-[#002844]">
                Acciones masivas
              </button>
            </div>
          )}
        </div>

        {/* Advanced Filters (Hidden by default) */}
        {showFilters && (
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rol
                </label>
                <select className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-[#00365b] focus:border-[#00365b] sm:text-sm rounded-md">
                  <option>Todos los roles</option>
                  <option>Docente</option>
                  <option>Consultor</option>
                  <option>Líder de Comunidad</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Escuela
                </label>
                <select className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-[#00365b] focus:border-[#00365b] sm:text-sm rounded-md">
                  <option>Todas las escuelas</option>
                  <option>Los Pellines</option>
                  <option>Otra Escuela</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ordenar por
                </label>
                <select 
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-[#00365b] focus:border-[#00365b] sm:text-sm rounded-md"
                >
                  <option value="date">Fecha de registro</option>
                  <option value="name">Nombre</option>
                  <option value="lastActive">Última actividad</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="w-12 px-6 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-[#00365b] focus:ring-[#00365b] border-gray-300 rounded"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
                      } else {
                        setSelectedUsers(new Set());
                      }
                    }}
                  />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Escuela
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rol
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Asignaciones
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr 
                  key={user.id} 
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(user.id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedUsers);
                        if (e.target.checked) {
                          newSelected.add(user.id);
                        } else {
                          newSelected.delete(user.id);
                        }
                        setSelectedUsers(newSelected);
                      }}
                      className="h-4 w-4 text-[#00365b] focus:ring-[#00365b] border-gray-300 rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-600">
                            {getUserName(user).split(' ').filter(n => n).map(n => n[0]).join('').toUpperCase() || '?'}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {getUserName(user)}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center">
                          <Mail className="w-3 h-3 mr-1" />
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-sm text-gray-900">
                      <Building className="w-4 h-4 mr-1 text-gray-400" />
                      {getUserPrimarySchool(user)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getStatusIcon(user.approval_status)}
                      <span className={`ml-2 text-sm capitalize ${
                        user.approval_status === 'pending' ? 'text-amber-600' :
                        user.approval_status === 'approved' ? 'text-green-600' :
                        'text-red-600'
                      }`}>
                        {user.approval_status === 'pending' ? 'Pendiente' :
                         user.approval_status === 'approved' ? 'Aprobado' :
                         'Rechazado'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(getUserPrimaryRole(user) || '')}`}>
                      <Shield className="w-3 h-3 mr-1" />
                      {getRoleDisplayName(user)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getAssignmentCount(user) > 0 ? (
                      <div className="flex items-center">
                        <Users className="w-4 h-4 mr-1 text-gray-400" />
                        <span>{getAssignmentCount(user)} asignaciones</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">Sin asignaciones</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      {user.approval_status === 'pending' && (
                        <>
                          <button
                            onClick={() => onApprove(user.id)}
                            className="text-green-600 hover:text-green-900 p-1 hover:bg-green-50 rounded transition-colors"
                            title="Aprobar usuario"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => onReject(user.id)}
                            className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded transition-colors"
                            title="Rechazar usuario"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </>
                      )}
                      {user.approval_status === 'approved' && (
                        <>
                          <button
                            onClick={() => onRoleChange(user)}
                            className="text-[#00365b] hover:text-[#002844] p-1 hover:bg-blue-50 rounded transition-colors"
                            title="Gestionar roles"
                          >
                            <Shield className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => onPasswordReset(user)}
                            className="text-[#00365b] hover:text-[#002844] p-1 hover:bg-blue-50 rounded transition-colors"
                            title="Restablecer contraseña"
                          >
                            <Key className="w-5 h-5" />
                          </button>
                        </>
                      )}
                      <div className="relative inline-block text-left">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
                          className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Más opciones"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        {openMenuId === user.id && (
                          <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                            <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                              {getUserPrimaryRole(user) === 'consultor' && (
                                <button
                                  onClick={() => {
                                    onAssign(user);
                                    setOpenMenuId(null);
                                  }}
                                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left"
                                  role="menuitem"
                                >
                                  <Users className="w-4 h-4 mr-3" />
                                  Asignar Estudiantes
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  if (confirm(`¿Estás seguro de que deseas eliminar a ${getUserName(user)}?`)) {
                                    onDelete(user);
                                  }
                                  setOpenMenuId(null);
                                }}
                                className="flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 w-full text-left"
                                role="menuitem"
                              >
                                <Trash2 className="w-4 h-4 mr-3" />
                                Eliminar Usuario
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Pagination */}
        <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
              Anterior
            </button>
            <button className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
              Siguiente
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Mostrando <span className="font-medium">1</span> a <span className="font-medium">10</span> de{' '}
                <span className="font-medium">{filteredUsers.length}</span> resultados
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">
                  <span className="sr-only">Anterior</span>
                  <ChevronDown className="h-5 w-5 rotate-90" />
                </button>
                <button className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
                  1
                </button>
                <button className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
                  2
                </button>
                <button className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
                  3
                </button>
                <button className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">
                  <span className="sr-only">Siguiente</span>
                  <ChevronDown className="h-5 w-5 -rotate-90" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}