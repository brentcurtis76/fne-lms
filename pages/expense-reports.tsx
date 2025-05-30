import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import Header from '../components/layout/Header';
import { ArrowLeft, FileText, Plus, Calendar, DollarSign, Receipt, Eye, Download, Trash2, Edit, Send, Check, X } from 'lucide-react';
import ExpenseReportForm from '../components/expenses/ExpenseReportForm';
import ExpenseReportDetails from '../components/expenses/ExpenseReportDetails';
import { sendEmail, generateExpenseReportSubmissionEmail, generateExpenseReportApprovalEmail } from '../utils/emailUtils';

interface ExpenseCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  is_active: boolean;
}

interface ExpenseReport {
  id: string;
  report_name: string;
  description?: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  total_amount: number;
  submitted_by: string;
  submitted_at?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_comments?: string;
  created_at: string;
  updated_at: string;
  profiles?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  expense_items?: ExpenseItem[];
}

interface ExpenseItem {
  id: string;
  report_id: string;
  category_id: string;
  description: string;
  amount: number;
  expense_date: string;
  vendor?: string;
  receipt_url?: string;
  receipt_filename?: string;
  notes?: string;
  expense_categories?: ExpenseCategory;
}

export default function ExpenseReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  
  // Data states
  const [expenseReports, setExpenseReports] = useState<ExpenseReport[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  
  // View states
  const [activeTab, setActiveTab] = useState<'lista' | 'nuevo' | 'editar'>('lista');
  const [selectedReport, setSelectedReport] = useState<ExpenseReport | null>(null);
  const [editingReport, setEditingReport] = useState<ExpenseReport | null>(null);
  const [deleteModalReport, setDeleteModalReport] = useState<ExpenseReport | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }
        
        setCurrentUser(session.user);
        
        // Check if user is admin
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, avatar_url')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setIsAdmin(profile.role === 'admin');
          setAvatarUrl(profile.avatar_url || '');
          
          // Redirect non-admins away from expense reports
          if (profile.role !== 'admin') {
            router.push('/dashboard');
            return;
          }
        }

        await Promise.all([
          loadExpenseReports(),
          loadCategories()
        ]);
        
        setLoading(false);
      } catch (error) {
        console.error('Error in checkSession:', error);
        setLoading(false);
        router.push('/login');
      }
    };

    checkSession();
  }, [router]);

  const loadExpenseReports = async () => {
    try {
      const { data, error } = await supabase
        .from('expense_reports')
        .select(`
          *,
          profiles!expense_reports_submitted_by_fkey(first_name, last_name, email),
          expense_items(
            *,
            expense_categories(*)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExpenseReports(data || []);
    } catch (error) {
      console.error('Error loading expense reports:', error);
      toast.error('Error al cargar los reportes de gastos');
    }
  };

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Error al cargar las categorías');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Check if current user is the designated approver
  const isDesignatedApprover = () => {
    return currentUser?.email === 'gnaranjo@nuevaeducacion.org';
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('es-CL')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CL');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft': return 'Borrador';
      case 'submitted': return 'Enviado';
      case 'approved': return 'Aprobado';
      case 'rejected': return 'Rechazado';
      default: return status;
    }
  };

  const handleDeleteReport = async (report: ExpenseReport) => {
    try {
      const { error } = await supabase
        .from('expense_reports')
        .delete()
        .eq('id', report.id);

      if (error) throw error;

      await loadExpenseReports();
      setDeleteModalReport(null);
      toast.success('Reporte eliminado exitosamente');
      
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('Error al eliminar el reporte: ' + (error as Error).message);
    }
  };

  const handleSubmitReport = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from('expense_reports')
        .update({ 
          status: 'submitted',
          submitted_at: new Date().toISOString()
        })
        .eq('id', reportId);

      if (error) throw error;

      // Get report details for email notification
      const { data: reportData } = await supabase
        .from('expense_reports')
        .select(`
          *,
          profiles!expense_reports_submitted_by_fkey(first_name, last_name, email)
        `)
        .eq('id', reportId)
        .single();

      if (reportData) {
        // Send email notification to designated approver
        const submitterName = `${reportData.profiles?.first_name || ''} ${reportData.profiles?.last_name || ''}`.trim() || 'Usuario';
        const submitterEmail = reportData.profiles?.email || '';
        
        const emailData = generateExpenseReportSubmissionEmail(
          reportData.report_name,
          submitterName,
          submitterEmail,
          reportData.total_amount,
          reportData.start_date,
          reportData.end_date
        );
        
        // Send email notification (non-blocking)
        sendEmail(emailData).catch(error => 
          console.error('Failed to send submission notification:', error)
        );
      }

      await loadExpenseReports();
      toast.success('Reporte enviado para revisión');
      
    } catch (error) {
      console.error('Error submitting report:', error);
      toast.error('Error al enviar el reporte: ' + (error as Error).message);
    }
  };

  const handleApproveReport = async (reportId: string) => {
    try {
      // Get the designated approver's ID and name
      const { data: approverProfile } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('email', 'gnaranjo@nuevaeducacion.org')
        .single();

      const { error } = await supabase
        .from('expense_reports')
        .update({ 
          status: 'approved',
          reviewed_by: approverProfile?.id || currentUser.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', reportId);

      if (error) throw error;

      // Get report details for email notification
      const { data: reportData } = await supabase
        .from('expense_reports')
        .select(`
          *,
          profiles!expense_reports_submitted_by_fkey(first_name, last_name, email)
        `)
        .eq('id', reportId)
        .single();

      if (reportData && reportData.profiles?.email) {
        // Send approval email to report creator
        const reviewerName = `${approverProfile?.first_name || ''} ${approverProfile?.last_name || ''}`.trim() || 'Administrador';
        
        const emailData = generateExpenseReportApprovalEmail(
          reportData.report_name,
          'approved',
          reviewerName,
          reportData.total_amount
        );
        
        emailData.to = reportData.profiles.email;
        
        // Send email notification (non-blocking)
        sendEmail(emailData).catch(error => 
          console.error('Failed to send approval notification:', error)
        );
      }

      await loadExpenseReports();
      toast.success('Reporte aprobado');
      
    } catch (error) {
      console.error('Error approving report:', error);
      toast.error('Error al aprobar el reporte: ' + (error as Error).message);
    }
  };

  const handleRejectReport = async (reportId: string) => {
    const comments = prompt('Comentarios de rechazo (opcional):');
    
    try {
      // Get the designated approver's ID and name
      const { data: approverProfile } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('email', 'gnaranjo@nuevaeducacion.org')
        .single();

      const { error } = await supabase
        .from('expense_reports')
        .update({ 
          status: 'rejected',
          reviewed_by: approverProfile?.id || currentUser.id,
          reviewed_at: new Date().toISOString(),
          review_comments: comments || undefined
        })
        .eq('id', reportId);

      if (error) throw error;

      // Get report details for email notification
      const { data: reportData } = await supabase
        .from('expense_reports')
        .select(`
          *,
          profiles!expense_reports_submitted_by_fkey(first_name, last_name, email)
        `)
        .eq('id', reportId)
        .single();

      if (reportData && reportData.profiles?.email) {
        // Send rejection email to report creator
        const reviewerName = `${approverProfile?.first_name || ''} ${approverProfile?.last_name || ''}`.trim() || 'Administrador';
        
        const emailData = generateExpenseReportApprovalEmail(
          reportData.report_name,
          'rejected',
          reviewerName,
          reportData.total_amount,
          comments || undefined
        );
        
        emailData.to = reportData.profiles.email;
        
        // Send email notification (non-blocking)
        sendEmail(emailData).catch(error => 
          console.error('Failed to send rejection notification:', error)
        );
      }

      await loadExpenseReports();
      toast.success('Reporte rechazado');
      
    } catch (error) {
      console.error('Error rejecting report:', error);
      toast.error('Error al rechazar el reporte: ' + (error as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand_beige flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
          <p className="mt-4 text-brand_blue font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Rendición de Gastos - FNE LMS</title>
      </Head>
      
      <div className="min-h-screen bg-brand_beige">
        {/* Only show header when not in form mode */}
        {activeTab === 'lista' ? (
          <Header 
            user={currentUser}
            isAdmin={isAdmin}
            onLogout={handleLogout}
            avatarUrl={avatarUrl}
          />
        ) : null}
        
        <main className={`container mx-auto pb-10 px-4 ${
          activeTab === 'lista' ? 'pt-44' : 'pt-8'
        }`}>
          <div className="max-w-7xl mx-auto">
            {/* Conditional Header */}
            {activeTab === 'lista' && (
              <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
                <div className="flex items-center space-x-4 mb-4 md:mb-0">
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center text-brand_blue hover:text-brand_yellow transition-colors"
                  >
                    <ArrowLeft className="mr-2" size={20} />
                    Volver al Panel
                  </Link>
                  <div className="h-6 w-px bg-gray-300"></div>
                  <h1 className="text-3xl font-bold text-brand_blue flex items-center">
                    <Receipt className="mr-3" size={32} />
                    Rendición de Gastos
                  </h1>
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => setActiveTab('lista')}
                    className="px-4 py-2 rounded-lg font-medium transition-colors bg-brand_blue text-white"
                  >
                    Lista de Reportes
                  </button>
                  <button
                    onClick={() => setActiveTab('nuevo')}
                    className="px-4 py-2 rounded-lg font-medium transition-colors flex items-center bg-white text-brand_blue border border-brand_yellow hover:bg-brand_yellow hover:text-brand_blue"
                  >
                    <Plus className="mr-2" size={16} />
                    Nuevo Reporte
                  </button>
                </div>
              </div>
            )}

            {/* Form Header for nuevo/editar modes */}
            {(activeTab === 'nuevo' || activeTab === 'editar') && (
              <div className="mb-8">
                <div className="flex items-center space-x-4 mb-6">
                  <button
                    onClick={() => setActiveTab('lista')}
                    className="inline-flex items-center text-brand_blue hover:text-brand_yellow transition-colors"
                  >
                    <ArrowLeft className="mr-2" size={20} />
                    Volver a Reportes
                  </button>
                  <div className="h-6 w-px bg-gray-300"></div>
                  <h1 className="text-3xl font-bold text-brand_blue flex items-center">
                    <Receipt className="mr-3" size={32} />
                    {activeTab === 'nuevo' ? 'Crear Nuevo Reporte' : 'Editar Reporte'}
                  </h1>
                </div>
              </div>
            )}

            {/* Content based on active tab */}
            {activeTab === 'lista' && (
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-brand_blue">
                    Reportes de Gastos ({expenseReports.length})
                  </h2>
                </div>

                {expenseReports.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse bg-white">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left py-4 px-4 font-semibold text-brand_blue">Nombre</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_blue">Período</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_blue">Total</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_blue">Estado</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_blue">Enviado por</th>
                          <th className="text-center py-4 px-4 font-semibold text-brand_blue">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenseReports.map((report) => (
                          <tr key={report.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-4 px-4">
                              <div>
                                <div className="font-medium text-brand_blue">{report.report_name}</div>
                                {report.description && (
                                  <div className="text-sm text-gray-500">{report.description}</div>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-sm text-gray-900">
                                {formatDate(report.start_date)} - {formatDate(report.end_date)}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="font-semibold text-brand_blue">
                                {formatCurrency(report.total_amount)}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(report.status)}`}>
                                {getStatusText(report.status)}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-sm text-gray-900">
                                {report.profiles?.first_name} {report.profiles?.last_name}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={() => setSelectedReport(report)}
                                  className="p-2 text-brand_blue hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Ver detalles"
                                >
                                  <Eye size={16} />
                                </button>
                                
                                {report.status === 'draft' && report.submitted_by === currentUser.id && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setEditingReport(report);
                                        setActiveTab('editar');
                                      }}
                                      className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                      title="Editar reporte"
                                    >
                                      <Edit size={16} />
                                    </button>
                                    <button
                                      onClick={() => handleSubmitReport(report.id)}
                                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                      title="Enviar para revisión"
                                    >
                                      <Send size={16} />
                                    </button>
                                  </>
                                )}

                                {isDesignatedApprover() && report.status === 'submitted' && (
                                  <>
                                    <button
                                      onClick={() => handleApproveReport(report.id)}
                                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                      title="Aprobar reporte"
                                    >
                                      <Check size={16} />
                                    </button>
                                    <button
                                      onClick={() => handleRejectReport(report.id)}
                                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Rechazar reporte"
                                    >
                                      <X size={16} />
                                    </button>
                                  </>
                                )}

                                {(report.submitted_by === currentUser.id || isAdmin) && (
                                  <button
                                    onClick={() => setDeleteModalReport(report)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Eliminar reporte"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-16 px-6">
                    <Receipt className="mx-auto mb-4 text-gray-300" size={64} />
                    <h3 className="text-xl font-medium text-gray-600 mb-2">No hay reportes de gastos</h3>
                    <p className="text-gray-500 mb-6">Comienza creando tu primer reporte de gastos</p>
                    <button
                      onClick={() => setActiveTab('nuevo')}
                      className="bg-brand_yellow text-brand_blue px-6 py-3 rounded-lg font-medium hover:bg-brand_yellow/90 transition-colors flex items-center mx-auto"
                    >
                      <Plus className="mr-2" size={20} />
                      Crear Primer Reporte
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'nuevo' && (
              <ExpenseReportForm
                categories={categories}
                onSuccess={() => {
                  setActiveTab('lista');
                  loadExpenseReports();
                }}
                onCancel={() => setActiveTab('lista')}
              />
            )}

            {activeTab === 'editar' && editingReport && (
              <ExpenseReportForm
                categories={categories}
                editingReport={editingReport}
                onSuccess={() => {
                  setActiveTab('lista');
                  setEditingReport(null);
                  loadExpenseReports();
                }}
                onCancel={() => {
                  setActiveTab('lista');
                  setEditingReport(null);
                }}
              />
            )}

            {/* Delete Confirmation Modal */}
            {deleteModalReport && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                  <div className="p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <Trash2 className="text-red-600" size={20} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Eliminar Reporte</h3>
                        <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
                      </div>
                    </div>
                    
                    <div className="mb-6">
                      <p className="text-gray-700">
                        ¿Estás seguro de que deseas eliminar el reporte{' '}
                        <span className="font-semibold text-brand_blue">{deleteModalReport.report_name}</span>?
                      </p>
                      <p className="text-sm text-gray-600 mt-2">
                        Se eliminarán también todos los gastos asociados a este reporte.
                      </p>
                    </div>
                    
                    <div className="flex space-x-3 justify-end">
                      <button
                        onClick={() => setDeleteModalReport(null)}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleDeleteReport(deleteModalReport)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        Eliminar Reporte
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Report Details Modal */}
            <ExpenseReportDetails
              report={selectedReport}
              isOpen={!!selectedReport}
              onClose={() => setSelectedReport(null)}
              onEdit={(report) => {
                setEditingReport(report);
                setSelectedReport(null);
                setActiveTab('editar');
              }}
              onDelete={(report) => {
                setDeleteModalReport(report);
                setSelectedReport(null);
              }}
              currentUser={currentUser}
              isAdmin={isAdmin}
            />
          </div>
        </main>
      </div>
    </>
  );
}