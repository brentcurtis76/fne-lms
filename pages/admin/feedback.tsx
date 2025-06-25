import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import MainLayout from '../../components/layout/MainLayout';
import { 
  Search, 
  Filter, 
  MessageSquare, 
  AlertCircle, 
  Lightbulb, 
  CheckCircle,
  Clock,
  Eye,
  ChevronRight,
  X,
  Download,
  RefreshCw
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import FeedbackDetail from '../../components/feedback/FeedbackDetail';
import { getEffectiveRoleAndStatus } from '../../utils/roleUtils';

interface Feedback {
  id: string;
  title: string | null;
  description: string;
  type: 'bug' | 'idea' | 'feedback';
  status: 'new' | 'seen' | 'in_progress' | 'resolved' | 'closed';
  page_url: string;
  screenshot_url: string | null;
  created_at: string;
  created_by: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  };
  _count?: {
    feedback_activity: number;
  };
}

export default function FeedbackDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [filteredList, setFilteredList] = useState<Feedback[]>([]);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  
  // Stats
  const [stats, setStats] = useState({
    new_count: 0,
    seen_count: 0,
    in_progress_count: 0,
    resolved_count: 0,
    bug_count: 0,
    idea_count: 0,
    feedback_count: 0
  });

  useEffect(() => {
    checkUserAndLoadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [feedbackList, searchTerm, statusFilter, typeFilter]);

  const checkUserAndLoadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      // Get effective role and admin status (handles dev impersonation)
      const { effectiveRole, isAdmin: isAdminUser } = await getEffectiveRoleAndStatus(session.user.id);
      
      setUserRole(effectiveRole);
      setIsAdmin(isAdminUser);

      // Check if user has admin access
      if (!isAdminUser) {
        router.push('/dashboard');
        return;
      }
      
      // Fetch avatar URL
      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();
      
      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }
      
      await loadFeedback();
      await loadStats();
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const loadFeedback = async () => {
    try {
      const { data, error } = await supabase
        .from('platform_feedback')
        .select(`
          *,
          profiles!created_by (
            first_name,
            last_name,
            email,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get activity counts
      const feedbackIds = data?.map(f => f.id) || [];
      const { data: activityCounts } = await supabase
        .from('feedback_activity')
        .select('feedback_id')
        .in('feedback_id', feedbackIds);

      // Map activity counts
      const countMap = activityCounts?.reduce((acc, item) => {
        acc[item.feedback_id] = (acc[item.feedback_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      const feedbackWithCounts = data?.map(item => ({
        ...item,
        _count: {
          feedback_activity: countMap[item.id] || 0
        }
      })) || [];

      setFeedbackList(feedbackWithCounts);
    } catch (error) {
      console.error('Error loading feedback:', error);
      toast.error('Error al cargar feedback');
    }
  };

  const loadStats = async () => {
    try {
      const { data, error } = await supabase
        .from('feedback_stats')
        .select('*')
        .single();

      if (error) throw error;
      if (data) setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...feedbackList];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.profiles.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.title && item.title.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(item => item.status === statusFilter);
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(item => item.type === typeFilter);
    }

    setFilteredList(filtered);
  };

  const updateFeedbackStatus = async (feedbackId: string, newStatus: string) => {
    console.log('Updating feedback status:', { feedbackId, newStatus });
    try {
      const updateData: any = { status: newStatus };
      
      // Set appropriate timestamps based on status
      if (newStatus === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
      } else if (newStatus === 'closed') {
        // If not already resolved, set resolved_at as well
        const currentFeedback = feedbackList.find(f => f.id === feedbackId);
        if (currentFeedback && !currentFeedback.resolved_at) {
          updateData.resolved_at = new Date().toISOString();
        }
        // TODO: Add closed_at when column is added to database
        // updateData.closed_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('platform_feedback')
        .update(updateData)
        .eq('id', feedbackId);

      if (error) {
        console.error('Supabase update error:', error);
        throw error;
      }

      console.log('Status updated successfully in database');

      // Update local state
      setFeedbackList(prev =>
        prev.map(item =>
          item.id === feedbackId
            ? { ...item, status: newStatus as any, ...updateData }
            : item
        )
      );

      // Update selected feedback if it's the same
      if (selectedFeedback?.id === feedbackId) {
        setSelectedFeedback(prev => prev ? { ...prev, status: newStatus as any, ...updateData } : null);
      }

      toast.success('Estado actualizado');
      await loadStats();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Error al actualizar estado');
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bug':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'idea':
        return <Lightbulb className="w-4 h-4 text-blue-500" />;
      default:
        return <MessageSquare className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      new: 'bg-red-100 text-red-800',
      seen: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-blue-100 text-blue-800',
      resolved: 'bg-green-100 text-green-800',
      closed: 'bg-gray-100 text-gray-800'
    };

    const labels = {
      new: 'Nuevo',
      seen: 'Visto',
      in_progress: 'En Progreso',
      resolved: 'Resuelto',
      closed: 'Cerrado'
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status as keyof typeof styles] || styles.new}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Hace menos de 1 hora';
    } else if (diffInHours < 24) {
      return `Hace ${Math.floor(diffInHours)} horas`;
    } else if (diffInHours < 48) {
      return 'Ayer';
    } else {
      return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <MainLayout 
        user={user} 
        currentPage="feedback"
        isAdmin={isAdmin}
        userRole={userRole}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <RefreshCw className="w-12 h-12 text-[#00365b] animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Cargando feedback...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <>
      <MainLayout 
        user={user} 
        currentPage="feedback"
        pageTitle="Gestión de Feedback"
        breadcrumbs={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Feedback' }
        ]}
        isAdmin={isAdmin}
        userRole={userRole}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Nuevos</p>
                  <p className="text-2xl font-semibold text-red-600">{stats.new_count}</p>
                </div>
                <div className="p-3 bg-red-100 rounded-full">
                  <Clock className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">En Progreso</p>
                  <p className="text-2xl font-semibold text-blue-600">{stats.in_progress_count}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <RefreshCw className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Resueltos</p>
                  <p className="text-2xl font-semibold text-green-600">{stats.resolved_count}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total</p>
                  <p className="text-2xl font-semibold text-gray-900">{feedbackList.length}</p>
                </div>
                <div className="p-3 bg-gray-100 rounded-full">
                  <MessageSquare className="w-6 h-6 text-gray-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow mb-6 p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Buscar por descripción o usuario..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
              >
                <option value="all">Todos los estados</option>
                <option value="new">Nuevos</option>
                <option value="seen">Vistos</option>
                <option value="in_progress">En Progreso</option>
                <option value="resolved">Resueltos</option>
                <option value="closed">Cerrados</option>
              </select>

              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
              >
                <option value="all">Todos los tipos</option>
                <option value="bug">Problemas</option>
                <option value="idea">Ideas</option>
                <option value="feedback">Feedback</option>
              </select>

              {/* Refresh */}
              <button
                onClick={() => {
                  loadFeedback();
                  loadStats();
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                title="Actualizar"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Feedback List */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="divide-y divide-gray-200">
              {filteredList.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>No se encontraron resultados</p>
                </div>
              ) : (
                filteredList.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedFeedback(item);
                      setShowDetail(true);
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {getTypeIcon(item.type)}
                          <span className="font-medium text-gray-900">
                            {item.profiles.first_name} {item.profiles.last_name || item.profiles.email}
                          </span>
                          <span className="text-sm text-gray-500">
                            {formatDate(item.created_at)}
                          </span>
                          {getStatusBadge(item.status)}
                          {item._count?.feedback_activity ? (
                            <span className="text-xs text-gray-500">
                              {item._count.feedback_activity} comentarios
                            </span>
                          ) : null}
                        </div>
                        <p className="text-gray-700 line-clamp-2">
                          {item.description}
                        </p>
                        <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                          <span className="truncate max-w-xs" title={item.page_url}>
                            {item.page_url}
                          </span>
                          {item.screenshot_url && (
                            <span className="flex items-center gap-1">
                              <Download className="w-3 h-3" />
                              Captura adjunta
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" />
                    </div>

                    {/* Quick Actions */}
                    {item.status === 'new' && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateFeedbackStatus(item.id, 'seen');
                          }}
                          className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition-colors"
                        >
                          Marcar como visto
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </MainLayout>

      {/* Detail Modal */}
      {selectedFeedback && (
        <FeedbackDetail
          feedback={selectedFeedback}
          isOpen={showDetail}
          onClose={() => {
            setShowDetail(false);
            setSelectedFeedback(null);
          }}
          onStatusUpdate={(status) => updateFeedbackStatus(selectedFeedback.id, status)}
          onRefresh={loadFeedback}
        />
      )}
    </>
  );
}