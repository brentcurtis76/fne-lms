import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { Plus, FileText, Eye, Edit, Trash2, Send, Clock, CheckCircle, Copy, ExternalLink, Calendar, Users, DollarSign, Search } from 'lucide-react';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import { PermissionGuard, HasPermission } from '../../../components/permissions/PermissionGuard';
import { usePermissions } from '../../../contexts/PermissionContext';

interface Quote {
  id: string;
  quote_number?: string;
  client_name: string;
  client_email?: string;
  client_institution?: string;
  arrival_date: string;
  departure_date: string;
  nights: number;
  num_pasantes: number;
  grand_total: number;
  status: string;
  created_at: string;
  valid_until?: string;
  viewed_at?: string;
}

function QuotesManagementPageContent() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null);

  useEffect(() => {
    fetchQuotes();
  }, []);

  // Debug: Log first quote to check if quote_number is present
  useEffect(() => {
    if (quotes.length > 0) {
      console.log('First quote data:', quotes[0]);
      console.log('Quote number:', quotes[0].quote_number);
    }
  }, [quotes]);

  const fetchQuotes = async () => {
    try {
      const { data, error } = await supabase
        .from('pasantias_quotes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuotes(data || []);
    } catch (error) {
      console.error('Error fetching quotes:', error);
      toast.error('Error al cargar las cotizaciones');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (quote: Quote) => {
    setQuoteToDelete(quote);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!quoteToDelete) return;
    
    try {
      const response = await fetch(`/api/quotes/${quoteToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Cotización eliminada exitosamente');
        setQuotes(quotes.filter(q => q.id !== quoteToDelete.id));
      } else {
        throw new Error('Error al eliminar la cotización');
      }
    } catch (error) {
      console.error('Error deleting quote:', error);
      toast.error('Error al eliminar la cotización');
    } finally {
      setDeleteModalOpen(false);
      setQuoteToDelete(null);
    }
  };

  const copyShareUrl = (quoteId: string) => {
    const url = `${window.location.origin}/quote/${quoteId}`;
    navigator.clipboard.writeText(url);
    toast.success('URL copiada al portapapeles');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-700', icon: Clock },
      sent: { label: 'Enviada', color: 'bg-blue-100 text-blue-700', icon: Send },
      viewed: { label: 'Vista', color: 'bg-yellow-100 text-yellow-700', icon: Eye },
      accepted: { label: 'Aceptada', color: 'bg-green-100 text-green-700', icon: CheckCircle },
      rejected: { label: 'Rechazada', color: 'bg-red-100 text-red-700', icon: Clock },
      expired: { label: 'Expirada', color: 'bg-gray-100 text-gray-500', icon: Clock },
    };

    const config = statusConfig[status] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
        <Icon className="mr-1.5" size={14} />
        {config.label}
      </span>
    );
  };

  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch = quote.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         quote.client_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         quote.client_institution?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         quote.quote_number?.toString().includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Cargando cotizaciones...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Head>
        <title>Cotizaciones - Pasantías Barcelona | Genera</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <FileText className="mr-3" size={32} />
                Cotizaciones - Pasantías Barcelona
              </h1>
              <p className="text-gray-600 mt-2">
                Gestiona las propuestas de pasantías internacionales
              </p>
            </div>
            
            <HasPermission permission="create_internship_proposals_all">
              <Link
                href="/admin/quotes/new"
                className="flex items-center px-6 py-3 bg-black text-white rounded-full font-medium hover:bg-gray-800 transition-colors"
              >
                <Plus className="mr-2" size={20} />
                Nueva Cotización
              </Link>
            </HasPermission>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Cotizaciones</p>
                <p className="text-3xl font-bold mt-1">{quotes.length}</p>
              </div>
              <FileText className="text-gray-400" size={32} />
            </div>
          </div>
          
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Enviadas</p>
                <p className="text-3xl font-bold mt-1">
                  {quotes.filter(q => ['sent', 'viewed'].includes(q.status)).length}
                </p>
              </div>
              <Send className="text-blue-400" size={32} />
            </div>
          </div>
          
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Aceptadas</p>
                <p className="text-3xl font-bold mt-1">
                  {quotes.filter(q => q.status === 'accepted').length}
                </p>
              </div>
              <CheckCircle className="text-green-400" size={32} />
            </div>
          </div>
          
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Valor Total</p>
                <p className="text-2xl font-bold mt-1">
                  ${quotes.reduce((sum, q) => sum + q.grand_total, 0).toLocaleString()}
                </p>
              </div>
              <DollarSign className="text-yellow-400" size={32} />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border p-6 mb-8">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Buscar por N° cotización, cliente, email o institución..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:border-black"
              />
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 border rounded-lg focus:outline-none focus:border-black"
            >
              <option value="all">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="sent">Enviada</option>
              <option value="viewed">Vista</option>
              <option value="accepted">Aceptada</option>
              <option value="rejected">Rechazada</option>
              <option value="expired">Expirada</option>
            </select>
          </div>
        </div>

        {/* Quotes Table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    N° Cotización
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fechas
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Detalles
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredQuotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-mono font-bold text-lg">#{quote.quote_number || '---'}</p>
                        <p className="text-xs text-gray-500">{formatDate(quote.created_at)}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium">{quote.client_name}</p>
                        {quote.client_institution && (
                          <p className="text-sm text-gray-500">{quote.client_institution}</p>
                        )}
                        {quote.client_email && (
                          <p className="text-sm text-gray-500">{quote.client_email}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm">
                        <Calendar className="mr-2 text-gray-400" size={16} />
                        <div>
                          <p>{formatDate(quote.arrival_date)}</p>
                          <p className="text-gray-500">
                            {quote.nights} noches
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm">
                        <Users className="mr-2 text-gray-400" size={16} />
                        <span>{quote.num_pasantes} pasantes</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-lg">
                        ${quote.grand_total.toLocaleString('es-CL')}
                      </p>
                      <p className="text-sm text-gray-500">CLP</p>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(quote.status)}
                      {quote.viewed_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Vista: {formatDate(quote.viewed_at)}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => copyShareUrl(quote.id)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Copiar URL"
                        >
                          <Copy size={18} />
                        </button>
                        
                        <a
                          href={`/quote/${quote.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Ver cotización"
                        >
                          <ExternalLink size={18} />
                        </a>
                        
                        <Link
                          href={`/admin/quotes/${quote.id}/edit`}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit size={18} />
                        </Link>
                        
                        <button
                          onClick={() => handleDelete(quote)}
                          className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                
                {filteredQuotes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      {searchTerm || statusFilter !== 'all'
                        ? 'No se encontraron cotizaciones con los filtros aplicados'
                        : 'No hay cotizaciones aún. Crea la primera!'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && quoteToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-4">Confirmar eliminación</h3>
            <p className="text-gray-600 mb-6">
              ¿Estás seguro de eliminar la cotización de <strong>{quoteToDelete.client_name}</strong>?
              Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="px-6 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}

export default function QuotesManagementPage() {
  return (
    <PermissionGuard
      permission="view_internship_proposals_all"
      redirectTo="/admin"
    >
      <QuotesManagementPageContent />
    </PermissionGuard>
  );
}