import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useState, useEffect } from 'react';
import { X, Calendar, DollarSign, Receipt, Eye, Download, Edit, Trash2, FileText, FileSpreadsheet } from 'lucide-react';

import { formatCurrency as formatCurrencyWithSymbol } from '../../lib/currency-service';
import { ExpenseReportExporter } from '../../lib/expenseReportExport';
import { toast } from 'react-hot-toast';

interface ExpenseCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  is_active: boolean;
}

interface ExpenseItem {
  id: string;
  report_id: string;
  category_id: string;
  description: string;
  amount: number;
  original_amount?: number;
  currency?: 'CLP' | 'USD' | 'EUR';
  conversion_rate?: number;
  conversion_date?: string;
  expense_date: string;
  vendor?: string;
  expense_number?: string;
  receipt_url?: string;
  receipt_filename?: string;
  notes?: string;
  expense_categories?: ExpenseCategory;
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

interface ExpenseReportDetailsProps {
  report: ExpenseReport | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (report: ExpenseReport) => void;
  onDelete: (report: ExpenseReport) => void;
  currentUser?: any;
  isAdmin?: boolean;
}

export default function ExpenseReportDetails({
  report,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  currentUser,
  isAdmin = false
}: ExpenseReportDetailsProps) {
  const supabase = useSupabaseClient();
  if (!isOpen || !report) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CL');
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('es-CL')}`;
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

  const getReceiptUrl = async (receiptUrl: string): Promise<string> => {
    // If it's already a full URL (signed URL), return as is
    if (receiptUrl.startsWith('http')) {
      return receiptUrl;
    }
    
    // If it's a file path, generate a signed URL
    try {
      const filePath = receiptUrl.startsWith('boletas/') ? receiptUrl.substring(8) : receiptUrl;
      const { data, error } = await supabase.storage
        .from('boletas')
        .createSignedUrl(filePath, 3600); // 1 hour
      
      if (error) throw error;
      return data.signedUrl;
    } catch (error) {
      console.error('Error generating receipt URL:', error);
      return receiptUrl; // Fallback to original
    }
  };

  const handleReceiptClick = async (item: ExpenseItem) => {
    try {
      let url = '';
      
      if (item.receipt_url) {
        url = await getReceiptUrl(item.receipt_url);
      } else if (item.receipt_filename) {
        // Try to find the file in storage and generate URL
        // For now, we'll try common receipt file patterns
        const { data: files, error: listError } = await supabase.storage
          .from('boletas')
          .list('', { limit: 50 });
          
        if (!listError && files) {
          // Find a PDF file (most receipts are PDFs)
          const receiptFile = files.find(file => 
            file.name.includes('receipt_') && file.name.endsWith('.pdf')
          ) || files[0]; // Fallback to first file
          
          if (receiptFile) {
            const { data: urlData, error: urlError } = await supabase.storage
              .from('boletas')
              .createSignedUrl(receiptFile.name, 3600);
              
            if (!urlError && urlData.signedUrl) {
              url = urlData.signedUrl;
            }
          }
        }
      }
      
      if (url) {
        window.open(url, '_blank');
      } else {
        console.warn('No receipt URL could be generated');
      }
    } catch (error) {
      console.error('Error opening receipt:', error);
    }
  };

  // Component to handle receipt display logic
  const ReceiptCell = ({ item }: { item: ExpenseItem }) => {
    // Simple logic: if there's a filename, assume there's a receipt
    const hasReceipt = !!(item.receipt_url || item.receipt_filename);

    if (hasReceipt) {
      return (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => handleReceiptClick(item)}
            className="flex items-center justify-center w-7 h-7 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            title={`Ver boleta: ${item.receipt_filename || 'archivo'}`}
          >
            <Eye className="text-blue-600" size={14} />
          </button>
          <button
            onClick={async () => {
              try {
                let url = '';
                if (item.receipt_url) {
                  url = await getReceiptUrl(item.receipt_url);
                } else if (item.receipt_filename) {
                  // Try to get any available file for download
                  const { data: files, error: listError } = await supabase.storage
                    .from('boletas')
                    .list('', { limit: 10 });
                  
                  if (!listError && files && files.length > 0) {
                    const receiptFile = files.find(file => 
                      file.name.includes('receipt_') && file.name.endsWith('.pdf')
                    ) || files[0];
                    
                    if (receiptFile) {
                      const { data: urlData, error: urlError } = await supabase.storage
                        .from('boletas')
                        .createSignedUrl(receiptFile.name, 3600);
                      
                      if (!urlError && urlData.signedUrl) {
                        url = urlData.signedUrl;
                      }
                    }
                  }
                }
                
                if (url) {
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = item.receipt_filename || 'receipt.pdf';
                  link.click();
                }
              } catch (error) {
                console.error('Error downloading receipt:', error);
              }
            }}
            className="flex items-center justify-center w-7 h-7 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
            title="Descargar boleta"
          >
            <Download className="text-green-600" size={14} />
          </button>
          <span className="text-xs text-green-600 font-medium ml-2" title={item.receipt_filename || 'Boleta disponible'}>
            ✅
          </span>
        </div>
      );
    }

    return <span className="text-gray-400 text-sm">Sin boleta</span>;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-brand_blue text-white p-6 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{report.report_name}</h2>
              <p className="text-blue-100">Detalles del Reporte de Gastos</p>
            </div>
            <button 
              onClick={onClose}
              className="text-white hover:text-blue-200 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Report Status and Actions */}
          <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center space-x-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(report.status)}`}>
                {getStatusText(report.status)}
              </span>
              <div className="text-sm text-gray-600">
                <strong>Total:</strong> {formatCurrency(report.total_amount)}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={async () => {
                  try {
                    console.log('ExpenseReportExporter:', ExpenseReportExporter);
                    console.log('typeof ExpenseReportExporter:', typeof ExpenseReportExporter);
                    console.log('ExpenseReportExporter methods:', Object.getOwnPropertyNames(ExpenseReportExporter));
                    
                    if (ExpenseReportExporter && typeof ExpenseReportExporter.exportToPDF === 'function') {
                      await ExpenseReportExporter.exportToPDF(report);
                      toast.success('Reporte exportado como PDF');
                    } else {
                      throw new Error('exportToPDF is not a function');
                    }
                  } catch (error) {
                    toast.error('Error al exportar PDF');
                    console.error('PDF export error:', error);
                  }
                }}
                className="flex items-center px-3 py-1 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
                title="Descargar como PDF"
              >
                <FileText size={14} className="mr-1" />
                PDF
              </button>
              <button
                onClick={async () => {
                  try {
                    await ExpenseReportExporter.exportToExcel(report);
                    toast.success('Reporte exportado como Excel');
                  } catch (error) {
                    toast.error('Error al exportar Excel');
                    console.error('Excel export error:', error);
                  }
                }}
                className="flex items-center px-3 py-1 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
                title="Descargar como Excel"
              >
                <FileSpreadsheet size={14} className="mr-1" />
                Excel
              </button>
              {/* Allow editing if: user is admin, user is author, or report is draft */}
              {(isAdmin || (currentUser && report.submitted_by === currentUser.id) || report.status === 'draft') && (
                <button
                  onClick={() => onEdit(report)}
                  className="flex items-center px-3 py-1 bg-brand_yellow text-brand_blue rounded-lg hover:bg-brand_yellow/90 transition-colors text-sm font-medium"
                  title={report.status !== 'draft' ? 'Editar como autor del reporte' : 'Editar reporte'}
                >
                  <Edit size={14} className="mr-1" />
                  Editar
                </button>
              )}
              <button
                onClick={() => onDelete(report)}
                className="flex items-center px-3 py-1 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
              >
                <Trash2 size={14} className="mr-1" />
                Eliminar
              </button>
            </div>
          </div>

          {/* Report Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-brand_blue border-b pb-2">Información General</h3>
              
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-gray-500">Período</div>
                  <div className="flex items-center text-gray-900">
                    <Calendar size={16} className="mr-2 text-brand_blue" />
                    {formatDate(report.start_date)} - {formatDate(report.end_date)}
                  </div>
                </div>
                
                {report.description && (
                  <div>
                    <div className="text-sm font-medium text-gray-500">Descripción</div>
                    <div className="text-gray-900">{report.description}</div>
                  </div>
                )}
                
                <div>
                  <div className="text-sm font-medium text-gray-500">Enviado por</div>
                  <div className="text-gray-900">
                    {report.profiles?.first_name} {report.profiles?.last_name}
                    <div className="text-sm text-gray-500">{report.profiles?.email}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-brand_blue border-b pb-2">Estado y Fechas</h3>
              
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-gray-500">Creado</div>
                  <div className="text-gray-900">{formatDate(report.created_at)}</div>
                </div>
                
                {report.submitted_at && (
                  <div>
                    <div className="text-sm font-medium text-gray-500">Enviado</div>
                    <div className="text-gray-900">{formatDate(report.submitted_at)}</div>
                  </div>
                )}
                
                {report.reviewed_at && (
                  <div>
                    <div className="text-sm font-medium text-gray-500">Revisado</div>
                    <div className="text-gray-900">{formatDate(report.reviewed_at)}</div>
                  </div>
                )}
                
                {report.review_comments && (
                  <div>
                    <div className="text-sm font-medium text-gray-500">Comentarios de Revisión</div>
                    <div className="text-gray-900 bg-yellow-50 p-3 rounded border border-yellow-200">
                      {report.review_comments}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Expense Items */}
          {report.expense_items && report.expense_items.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-brand_blue border-b pb-2">
                Gastos Detallados ({report.expense_items.length})
              </h3>
              
              <div className="overflow-x-auto">
                <table className="w-full border border-gray-200 rounded-lg">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-brand_blue">Fecha</th>
                      <th className="text-left py-3 px-4 font-semibold text-brand_blue">Categoría</th>
                      <th className="text-left py-3 px-4 font-semibold text-brand_blue">Descripción</th>
                      <th className="text-left py-3 px-4 font-semibold text-brand_blue">Proveedor</th>
                      <th className="text-left py-3 px-4 font-semibold text-brand_blue">N° Factura/Boleta</th>
                      <th className="text-right py-3 px-4 font-semibold text-brand_blue">Monto</th>
                      <th className="text-center py-3 px-4 font-semibold text-brand_blue">Boleta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.expense_items.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="py-3 px-4 text-gray-900">
                          {formatDate(item.expense_date)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center">
                            <div 
                              className="w-3 h-3 rounded-full mr-2"
                              style={{ backgroundColor: item.expense_categories?.color || '#6B7280' }}
                            ></div>
                            <span className="text-gray-900">
                              {item.expense_categories?.name || 'Sin categoría'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-gray-900">{item.description}</div>
                          {item.notes && (
                            <div className="text-sm text-gray-500 mt-1">{item.notes}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-900">
                          {item.vendor || '-'}
                        </td>
                        <td className="py-3 px-4 text-gray-900">
                          {item.expense_number || '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-gray-900">
                          <div className="space-y-1">
                            {item.currency && item.currency !== 'CLP' && item.original_amount ? (
                              <>
                                <div className="text-sm text-gray-600">
                                  {formatCurrencyWithSymbol(item.original_amount, item.currency)}
                                </div>
                                <div className="text-xs text-gray-500">
                                  ≈ ${item.amount.toLocaleString('es-CL')} CLP
                                </div>
                              </>
                            ) : (
                              <div>${item.amount.toLocaleString('es-CL')}</div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <ReceiptCell item={item} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={5} className="py-3 px-4 text-right font-semibold text-brand_blue">
                        Total:
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-brand_blue">
                        {formatCurrency(report.total_amount)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Summary by Category */}
          {report.expense_items && report.expense_items.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-brand_blue border-b pb-2">
                Resumen por Categoría
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(
                  report.expense_items.reduce((acc, item) => {
                    const categoryName = item.expense_categories?.name || 'Sin categoría';
                    const categoryColor = item.expense_categories?.color || '#6B7280';
                    
                    if (!acc[categoryName]) {
                      acc[categoryName] = { total: 0, count: 0, color: categoryColor };
                    }
                    acc[categoryName].total += item.amount;
                    acc[categoryName].count += 1;
                    return acc;
                  }, {} as Record<string, { total: number; count: number; color: string }>)
                ).map(([category, data]) => (
                  <div key={category} className="bg-gray-50 p-4 rounded-lg border">
                    <div className="flex items-center mb-2">
                      <div 
                        className="w-3 h-3 rounded-full mr-2"
                        style={{ backgroundColor: data.color }}
                      ></div>
                      <h4 className="font-semibold text-gray-900">{category}</h4>
                    </div>
                    <div className="text-sm text-gray-600">
                      {data.count} gasto{data.count !== 1 ? 's' : ''}
                    </div>
                    <div className="text-lg font-bold text-brand_blue">
                      {formatCurrency(data.total)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}