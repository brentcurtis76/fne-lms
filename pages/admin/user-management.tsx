import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import Header from '../../components/layout/Header';
import { Trash2, Plus, X, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

type User = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  school: string;
  created_at: string;
};

export default function UserManagement() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  
  // Add user form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
  const [newUserRole, setNewUserRole] = useState('docente');
  const [isCreating, setIsCreating] = useState(false);
  
  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{id: string, email: string} | null>(null);

  useEffect(() => {
    const checkAdminAndFetchUsers = async () => {
      // Check if current user is admin
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }

      setCurrentUser(session.user);

      // Check admin status from both metadata and profile
      const { data: userData } = await supabase.auth.getUser();
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, avatar_url')
        .eq('id', session.user.id)
        .single();

      const adminRole = userData?.user?.user_metadata?.role === 'admin' || profileData?.role === 'admin';
      
      if (!adminRole) {
        router.push('/dashboard');
        return;
      }

      setIsAdmin(true);

      // Set avatar URL if available
      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      } else {
        // Generate fallback avatar
        const fallbackAvatar = 'https://ui-avatars.com/api/?name=' + 
          encodeURIComponent(session.user.email?.split('@')[0] || 'User') + 
          '&background=00365b&color=fdb933&size=128';
        setAvatarUrl(fallbackAvatar);
      }

      // Fetch all users
      const { data: usersData, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role, school, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching users:', error);
      } else {
        setUsers(usersData || []);
      }

      setLoading(false);
    };

    checkAdminAndFetchUsers();
  }, [router]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      // Get current user's session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }

      // Call the admin API to update the role
      const response = await fetch('/api/admin/update-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId,
          newRole
        })
      });

      let result;
      const responseText = await response.text();
      
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', responseText);
        throw new Error(`Invalid response from server: ${responseText.substring(0, 100)}...`);
      }

      if (!response.ok) {
        throw new Error(result.error || `Server error: ${response.status}`);
      }

      // Update local state
      setUsers(users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ));

      toast.success(`Rol actualizado a ${newRole}`, {
        duration: 3000,
        position: 'top-right',
        style: {
          background: '#10B981',
          color: 'white',
        },
        icon: '✅',
      });
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error(`Error al actualizar rol: ${error.message}`, {
        duration: 5000,
        position: 'top-right',
        style: {
          background: '#EF4444',
          color: 'white',
        },
        icon: '❌',
      });
    }
  };

  const handleDeleteClick = (userId: string, userEmail: string) => {
    setUserToDelete({ id: userId, email: userEmail });
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    try {
      // Get current user's session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }

      // Call the admin API to delete the user
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: userToDelete.id
        })
      });

      let result;
      const responseText = await response.text();
      
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', responseText);
        throw new Error(`Invalid response from server: ${responseText.substring(0, 100)}...`);
      }

      if (!response.ok) {
        throw new Error(result.error || `Server error: ${response.status}`);
      }

      // Update local state
      setUsers(users.filter(user => user.id !== userToDelete.id));
      setShowDeleteModal(false);
      setUserToDelete(null);
      
      // Show success toast
      toast.success('Usuario eliminado correctamente', {
        duration: 4000,
        position: 'top-right',
        style: {
          background: '#10B981',
          color: 'white',
        },
        icon: '🗑️',
      });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error(`Error al eliminar usuario: ${error.message}`, {
        duration: 5000,
        position: 'top-right',
        style: {
          background: '#EF4444',
          color: 'white',
        },
        icon: '❌',
      });
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUserEmail.trim() || !newUserPassword.trim()) {
      toast.error('Email y contraseña son obligatorios', {
        duration: 4000,
        position: 'top-right',
        style: {
          background: '#EF4444',
          color: 'white',
        },
        icon: '⚠️',
      });
      return;
    }

    setIsCreating(true);
    try {
      // Create user with Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          data: {
            role: newUserRole
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email: newUserEmail,
            first_name: newUserFirstName,
            last_name: newUserLastName,
            role: newUserRole
          });

        if (profileError) throw profileError;

        // Add to local state
        const newUser: User = {
          id: data.user.id,
          email: newUserEmail,
          first_name: newUserFirstName,
          last_name: newUserLastName,
          role: newUserRole,
          school: '',
          created_at: new Date().toISOString()
        };

        setUsers([newUser, ...users]);
        
        // Reset form
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserFirstName('');
        setNewUserLastName('');
        setNewUserRole('docente');
        setShowAddForm(false);
        
        toast.success('Usuario creado correctamente', {
          duration: 4000,
          position: 'top-right',
          style: {
            background: '#10B981',
            color: 'white',
          },
          icon: '👤',
        });
      }
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error(`Error al crear usuario: ${error.message}`, {
        duration: 5000,
        position: 'top-right',
        style: {
          background: '#EF4444',
          color: 'white',
        },
        icon: '❌',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // Clear remember me preferences on logout
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  if (loading) {
    return (
      <>
        <Header 
          user={currentUser}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          avatarUrl={avatarUrl}
        />
        <div className="min-h-screen bg-gray-100 flex justify-center items-center pt-32">
          <p className="text-xl text-[#00365b]">Cargando usuarios...</p>
        </div>
      </>
    );
  }

  if (!isAdmin) {
    return (
      <>
        <Header 
          user={currentUser}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          avatarUrl={avatarUrl}
        />
        <div className="min-h-screen bg-gray-100 flex justify-center items-center pt-32">
          <p className="text-xl text-red-600">Acceso denegado. Solo administradores.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header 
        user={currentUser}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      />
      <Head>
        <title>Gestión de Usuarios | FNE LMS</title>
      </Head>
      
      <div className="min-h-screen bg-gray-100 px-4 md:px-8 py-4 md:py-8 pt-16">
        <div className="max-w-6xl mx-auto bg-white p-6 rounded-lg shadow-lg mt-48">
          
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-[#00365b] mb-2">
                Gestión de Usuarios
              </h1>
              <p className="text-gray-600">
                Administra los roles de los usuarios del sistema
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-[#00365b] hover:bg-[#fdb933] hover:text-[#00365b] text-white px-4 py-2 rounded-md flex items-center gap-2 transition"
            >
              <Plus size={20} />
              Agregar Usuario
            </button>
          </div>

          {/* Add User Form */}
          {showAddForm && (
            <div className="mb-6 bg-gray-50 p-6 rounded-lg border">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-[#00365b]">Crear Nuevo Usuario</h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                    placeholder="usuario@ejemplo.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña *
                  </label>
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={newUserFirstName}
                    onChange={(e) => setNewUserFirstName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                    placeholder="Nombre"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Apellido
                  </label>
                  <input
                    type="text"
                    value={newUserLastName}
                    onChange={(e) => setNewUserLastName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                    placeholder="Apellido"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rol
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                  >
                    <option value="docente">Docente</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-4 py-2 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] disabled:opacity-50 transition"
                  >
                    {isCreating ? 'Creando...' : 'Crear Usuario'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Nombre</th>
                  <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Email</th>
                  <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Escuela</th>
                  <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Rol Actual</th>
                  <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Cambiar Rol</th>
                  <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {user.first_name && user.last_name 
                        ? `${user.first_name} ${user.last_name}`
                        : 'Sin nombre'
                      }
                    </td>
                    <td className="px-4 py-3">{user.email || 'Sin email'}</td>
                    <td className="px-4 py-3">{user.school || 'Sin escuela'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.role === 'admin' 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {user.role || 'docente'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role || 'docente'}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                      >
                        <option value="docente">Docente</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteClick(user.id, user.email)}
                        className="text-red-600 hover:text-red-800 p-1 rounded transition"
                        title="Eliminar usuario"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No se encontraron usuarios</p>
            </div>
          )}

        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Confirmar Eliminación
                </h3>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600">
                ¿Estás seguro de que quieres eliminar al usuario{' '}
                <span className="font-semibold text-gray-900">{userToDelete.email}</span>?
              </p>
              <p className="text-sm text-red-600 mt-2">
                Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setUserToDelete(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition flex items-center gap-2"
              >
                <Trash2 size={16} />
                Eliminar Usuario
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}