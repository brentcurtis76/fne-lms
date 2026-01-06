import React, { useState, useEffect } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';
import { 
  UserAddIcon, 
  UserRemoveIcon, 
  SearchIcon,
  CheckIcon,
  XIcon
} from '@heroicons/react/outline';

interface UserWithPermission {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  has_permission: boolean;
  permission_id?: string;
}

export default function FeedbackPermissionsManager() {
  const supabase = useSupabaseClient();
  const [users, setUsers] = useState<UserWithPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  useEffect(() => {
    loadUsers();
  }, [supabase]);

  const loadUsers = async () => {
    try {
      setLoading(true);

      // Get all users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role')
        .order('email');

      if (profilesError) throw profilesError;

      // Get all feedback permissions
      const { data: permissions, error: permissionsError } = await supabase
        .from('feedback_permissions')
        .select('user_id, id, is_active')
        .eq('is_active', true)
        .is('revoked_at', null);

      if (permissionsError) throw permissionsError;

      // Merge the data
      const usersWithPermissions = profiles.map(profile => {
        const permission = permissions?.find(p => p.user_id === profile.id);
        return {
          ...profile,
          has_permission: profile.role === 'admin' || !!permission,
          permission_id: permission?.id
        };
      });

      setUsers(usersWithPermissions);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  const grantPermission = async (userId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      const { error } = await supabase
        .from('feedback_permissions')
        .insert({
          user_id: userId,
          granted_by: user.id,
          is_active: true
        });

      if (error) throw error;

      toast.success('Permiso otorgado exitosamente');
      await loadUsers();
    } catch (error) {
      console.error('Error granting permission:', error);
      toast.error('Error al otorgar permiso');
    }
  };

  const revokePermission = async (userId: string, permissionId: string) => {
    try {
      const { error } = await supabase
        .from('feedback_permissions')
        .update({
          is_active: false,
          revoked_at: new Date().toISOString()
        })
        .eq('id', permissionId);

      if (error) throw error;

      toast.success('Permiso revocado exitosamente');
      await loadUsers();
    } catch (error) {
      console.error('Error revoking permission:', error);
      toast.error('Error al revocar permiso');
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    
    return matchesSearch && matchesRole;
  });

  const getRoleName = (role: string) => {
    const roleNames: Record<string, string> = {
      admin: 'Administrador',
      consultor: 'Consultor',
      equipo_directivo: 'Equipo Directivo',
      lider_generacion: 'Líder de Generación',
      lider_comunidad: 'Líder de Comunidad',
      docente: 'Docente'
    };
    return roleNames[role] || role;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a0a0a]"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          Permisos para Reportar Problemas
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Administra qué usuarios pueden reportar bugs y solicitar mejoras
        </p>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
            />
          </div>
          
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
          >
            <option value="all">Todos los roles</option>
            <option value="admin">Administradores</option>
            <option value="consultor">Consultores</option>
            <option value="equipo_directivo">Equipo Directivo</option>
            <option value="lider_generacion">Líder de Generación</option>
            <option value="lider_comunidad">Líder de Comunidad</option>
            <option value="docente">Docentes</option>
          </select>
        </div>
      </div>

      {/* Users List */}
      <div className="divide-y divide-gray-200">
        {filteredUsers.map(user => (
          <div key={user.id} className="p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="text-sm text-gray-600">{user.email}</p>
                  </div>
                  <span className={`
                    inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                    ${user.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}
                  `}>
                    {getRoleName(user.role)}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {user.role === 'admin' ? (
                  <span className="flex items-center text-sm text-gray-500">
                    <CheckIcon className="h-4 w-4 mr-1 text-green-500" />
                    Siempre activo
                  </span>
                ) : user.has_permission ? (
                  <button
                    onClick={() => revokePermission(user.id, user.permission_id!)}
                    className="flex items-center px-3 py-1 text-sm bg-red-50 text-red-700 hover:bg-red-100 rounded-md transition-colors"
                  >
                    <UserRemoveIcon className="h-4 w-4 mr-1" />
                    Revocar permiso
                  </button>
                ) : (
                  <button
                    onClick={() => grantPermission(user.id)}
                    className="flex items-center px-3 py-1 text-sm bg-green-50 text-green-700 hover:bg-green-100 rounded-md transition-colors"
                  >
                    <UserAddIcon className="h-4 w-4 mr-1" />
                    Otorgar permiso
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          No se encontraron usuarios con los filtros aplicados
        </div>
      )}
    </div>
  );
}