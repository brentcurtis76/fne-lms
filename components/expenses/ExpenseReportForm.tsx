import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Save, Calendar, DollarSign, Upload, X, Eye, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { convertToCLP, formatCurrency, getAvailableCurrencies } from '../../lib/currency-service';

interface ExpenseCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  is_active: boolean;
}

interface ExpenseItemForm {
  id?: string;
  category_id: string;
  description: string;
  amount: number;
  original_amount?: number;
  currency: 'CLP' | 'USD' | 'EUR';
  conversion_rate?: number;
  expense_date: string;
  vendor: string;
  notes: string;
  receipt_file?: File;
  receipt_url?: string;
  receipt_filename?: string;
}

interface ExpenseReportFormProps {
  categories: ExpenseCategory[];
  editingReport?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ExpenseReportForm({ categories, editingReport, onSuccess, onCancel }: ExpenseReportFormProps) {
  const [loading, setLoading] = useState(false);
  const [uploadingReceipts, setUploadingReceipts] = useState<Set<number>>(new Set());
  
  // Form states
  const [reportForm, setReportForm] = useState({
    report_name: '',
    description: '',
    start_date: '',
    end_date: ''
  });
  
  const [expenseItems, setExpenseItems] = useState<ExpenseItemForm[]>([
    {
      category_id: '',
      description: '',
      amount: 0,
      currency: 'CLP',
      expense_date: '',
      vendor: '',
      notes: ''
    }
  ]);

  // Populate form when editing
  useEffect(() => {
    if (editingReport) {
      setReportForm({
        report_name: editingReport.report_name || '',
        description: editingReport.description || '',
        start_date: editingReport.start_date || '',
        end_date: editingReport.end_date || ''
      });
      
      if (editingReport.expense_items && editingReport.expense_items.length > 0) {
        const items = editingReport.expense_items.map((item: any) => ({
          id: item.id,
          category_id: item.category_id || '',
          description: item.description || '',
          amount: item.amount || 0,
          expense_date: item.expense_date || '',
          vendor: item.vendor || '',
          notes: item.notes || '',
          receipt_url: item.receipt_url,
          receipt_filename: item.receipt_filename
        }));
        setExpenseItems(items);
      }
    }
  }, [editingReport]);

  const addExpenseItem = () => {
    setExpenseItems([...expenseItems, {
      category_id: '',
      description: '',
      amount: 0,
      currency: 'CLP',
      expense_date: '',
      vendor: '',
      notes: ''
    }]);
  };

  const removeExpenseItem = (index: number) => {
    if (expenseItems.length > 1) {
      setExpenseItems(expenseItems.filter((_, i) => i !== index));
    }
  };

  const updateExpenseItem = async (index: number, field: keyof ExpenseItemForm, value: any) => {
    const updatedItems = [...expenseItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    // If currency or amount changed, handle conversion
    if (field === 'currency' || field === 'amount') {
      const item = updatedItems[index];
      if (item.amount > 0 && item.currency) {
        try {
          const conversion = await convertToCLP(item.amount, item.currency);
          updatedItems[index] = {
            ...updatedItems[index],
            original_amount: conversion.originalAmount,
            amount: conversion.convertedAmount, // Store CLP equivalent
            conversion_rate: conversion.conversionRate
          };
        } catch (error) {
          console.error('Currency conversion error:', error);
          toast.error('Error al convertir moneda');
        }
      }
    }
    
    setExpenseItems(updatedItems);
  };

  const handleReceiptUpload = async (index: number, file: File) => {
    if (!file) return;

    setUploadingReceipts(prev => new Set(prev).add(index));
    console.log('📤 Starting upload for file:', file.name, 'at index:', index);

    try {
      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `receipt_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      console.log('📁 Generated filename:', fileName);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('boletas')
        .upload(fileName, file);

      if (uploadError) throw uploadError;
      
      console.log('✅ File uploaded successfully:', uploadData);

      // Get signed URL for private bucket (valid for 1 year)
      const { data: urlData, error: urlError } = await supabase.storage
        .from('boletas')
        .createSignedUrl(fileName, 365 * 24 * 60 * 60); // 1 year

      let finalUrl = '';
      if (urlError) {
        console.warn('⚠️ Error creating signed URL, using basic path:', urlError);
        finalUrl = `boletas/${fileName}`;
      } else {
        console.log('🔗 Signed URL created:', urlData.signedUrl);
        finalUrl = urlData.signedUrl;
      }
      
      // Update the form state
      console.log('📝 Updating expense item with URL:', finalUrl);
      updateExpenseItem(index, 'receipt_url', finalUrl);
      updateExpenseItem(index, 'receipt_filename', file.name);
      
      // Log the current state after update
      console.log('📊 Current expense items after update:', expenseItems);
      
      toast.success(`✅ Boleta subida exitosamente: ${file.name}`);
      
    } catch (error) {
      console.error('❌ Error uploading receipt:', error);
      toast.error('Error al subir la boleta: ' + (error as Error).message);
    } finally {
      setUploadingReceipts(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  const handleReceiptDelete = async (index: number) => {
    const item = expenseItems[index];
    if (!item.receipt_url) return;

    try {
      // Extract file name from URL to delete from storage
      const urlParts = item.receipt_url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      
      // Delete from Supabase Storage
      const { error: deleteError } = await supabase.storage
        .from('boletas')
        .remove([fileName]);

      if (deleteError) {
        console.warn('Error deleting file from storage:', deleteError);
        // Continue anyway - might be already deleted or not exist
      }

      // Clear the receipt from the form
      updateExpenseItem(index, 'receipt_url', '');
      updateExpenseItem(index, 'receipt_filename', '');
      
      toast.success('Boleta eliminada');
      
    } catch (error) {
      console.error('Error deleting receipt:', error);
      toast.error('Error al eliminar la boleta');
    }
  };

  const calculateTotal = () => {
    return expenseItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const handleSaveReport = async () => {
    setLoading(true);
    try {
      // Validation
      if (!reportForm.report_name.trim()) {
        toast.error('El nombre del reporte es obligatorio');
        return;
      }
      
      if (!reportForm.start_date || !reportForm.end_date) {
        toast.error('Las fechas de inicio y fin son obligatorias');
        return;
      }

      if (new Date(reportForm.start_date) > new Date(reportForm.end_date)) {
        toast.error('La fecha de inicio no puede ser posterior a la fecha de fin');
        return;
      }

      const validItems = expenseItems.filter(item => 
        item.description.trim() && item.amount > 0 && item.category_id && item.expense_date
      );

      if (validItems.length === 0) {
        toast.error('Debe agregar al menos un gasto válido');
        return;
      }

      const totalAmount = calculateTotal();

      if (editingReport) {
        // UPDATE MODE
        const { error: reportError } = await supabase
          .from('expense_reports')
          .update({
            report_name: reportForm.report_name,
            description: reportForm.description || null,
            start_date: reportForm.start_date,
            end_date: reportForm.end_date,
            total_amount: totalAmount,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingReport.id);

        if (reportError) throw reportError;

        // Delete existing items and create new ones
        const { error: deleteError } = await supabase
          .from('expense_items')
          .delete()
          .eq('report_id', editingReport.id);
          
        if (deleteError) throw deleteError;

        // Create new items
        const itemsData = validItems.map(item => ({
          report_id: editingReport.id,
          category_id: item.category_id,
          description: item.description,
          amount: item.amount,
          original_amount: item.original_amount || item.amount,
          currency: item.currency || 'CLP',
          conversion_rate: item.conversion_rate || 1.0,
          conversion_date: new Date().toISOString().split('T')[0],
          expense_date: item.expense_date,
          vendor: item.vendor || null,
          receipt_url: item.receipt_url || null,
          receipt_filename: item.receipt_filename || null,
          notes: item.notes || null
        }));

        const { error: itemsError } = await supabase
          .from('expense_items')
          .insert(itemsData);

        if (itemsError) throw itemsError;

        toast.success('Reporte actualizado exitosamente');
        
      } else {
        // CREATE MODE
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuario no autenticado');

        // Create report
        const { data: newReport, error: reportError } = await supabase
          .from('expense_reports')
          .insert([{
            report_name: reportForm.report_name,
            description: reportForm.description || null,
            start_date: reportForm.start_date,
            end_date: reportForm.end_date,
            total_amount: totalAmount,
            submitted_by: user.id,
            status: 'draft'
          }])
          .select()
          .single();

        if (reportError) throw reportError;

        // Create expense items
        const itemsData = validItems.map(item => ({
          report_id: newReport.id,
          category_id: item.category_id,
          description: item.description,
          amount: item.amount,
          original_amount: item.original_amount || item.amount,
          currency: item.currency || 'CLP',
          conversion_rate: item.conversion_rate || 1.0,
          conversion_date: new Date().toISOString().split('T')[0],
          expense_date: item.expense_date,
          vendor: item.vendor || null,
          receipt_url: item.receipt_url || null,
          receipt_filename: item.receipt_filename || null,
          notes: item.notes || null
        }));

        const { error: itemsError } = await supabase
          .from('expense_items')
          .insert(itemsData);

        if (itemsError) throw itemsError;

        toast.success('Reporte creado exitosamente');
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving report:', error);
      toast.error('Error al guardar el reporte: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-xl font-semibold text-brand_blue">
          {editingReport ? 'Editar Reporte de Gastos' : 'Nuevo Reporte de Gastos'}
        </h2>
      </div>

      <div className="p-6 space-y-6">
        {/* Report Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-brand_blue border-b pb-2">Información del Reporte</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre del Reporte *
              </label>
              <input
                type="text"
                value={reportForm.report_name}
                onChange={(e) => setReportForm({ ...reportForm, report_name: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                placeholder="Ej: Gastos Marzo 2025"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción
              </label>
              <input
                type="text"
                value={reportForm.description}
                onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                placeholder="Descripción opcional del reporte"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha de Inicio *
              </label>
              <input
                type="date"
                value={reportForm.start_date}
                onChange={(e) => setReportForm({ ...reportForm, start_date: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha de Fin *
              </label>
              <input
                type="date"
                value={reportForm.end_date}
                onChange={(e) => setReportForm({ ...reportForm, end_date: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                min={reportForm.start_date}
              />
            </div>
          </div>
        </div>

        {/* Expense Items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-brand_blue border-b pb-2">Gastos</h3>
            <button
              type="button"
              onClick={addExpenseItem}
              className="flex items-center px-4 py-2 bg-brand_blue text-white rounded-lg hover:bg-brand_blue/90 transition-colors text-sm font-medium"
            >
              <Plus size={16} className="mr-1" />
              Agregar Gasto
            </button>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600 mb-2">
              <strong>Total del Reporte:</strong> ${calculateTotal().toLocaleString('es-CL')}
            </div>
          </div>

          <div className="space-y-4">
            {expenseItems.map((item, index) => (
              <div key={index} className="p-4 bg-white border border-gray-200 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-brand_blue">Gasto {index + 1}</h4>
                  {expenseItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeExpenseItem(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar gasto"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Categoría *
                    </label>
                    <select
                      value={item.category_id}
                      onChange={(e) => updateExpenseItem(index, 'category_id', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_blue focus:border-transparent text-sm"
                    >
                      <option value="">Seleccionar categoría</option>
                      {categories.map(category => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Descripción *
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateExpenseItem(index, 'description', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_blue focus:border-transparent text-sm"
                      placeholder="Descripción del gasto"
                    />
                  </div>

                  <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
                    <label className="block text-sm font-medium text-brand_blue mb-2">
                      💰 Moneda *
                    </label>
                    <select
                      value={item.currency}
                      onChange={(e) => updateExpenseItem(index, 'currency', e.target.value as 'CLP' | 'USD' | 'EUR')}
                      className="w-full p-3 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-brand_blue text-sm font-medium bg-white"
                    >
                      {getAvailableCurrencies().map(currency => (
                        <option key={currency.code} value={currency.code}>
                          {currency.symbol} {currency.code} - {currency.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
                    <label className="block text-sm font-medium text-brand_blue mb-2">
                      💵 Monto ({item.currency}) *
                    </label>
                    <div className="space-y-2">
                      <input
                        type="number"
                        min="0"
                        step={item.currency === 'CLP' ? '1' : '0.01'}
                        value={item.currency === 'CLP' ? (item.amount || '') : (item.original_amount || '')}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          if (item.currency === 'CLP') {
                            updateExpenseItem(index, 'amount', value);
                          } else {
                            updateExpenseItem(index, 'amount', value);
                          }
                        }}
                        className="w-full p-3 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-brand_blue text-sm font-medium bg-white"
                        placeholder="0.00"
                      />
                      {item.currency !== 'CLP' && item.conversion_rate && item.original_amount && (
                        <div className="text-sm text-blue-700 font-medium bg-blue-100 p-2 rounded">
                          ≈ ${Math.round((item.original_amount || 0) * (item.conversion_rate || 1)).toLocaleString('es-CL')} CLP
                          <span className="text-xs text-blue-600 block">Tasa: {item.conversion_rate?.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Fecha del Gasto *
                    </label>
                    <input
                      type="date"
                      value={item.expense_date}
                      onChange={(e) => updateExpenseItem(index, 'expense_date', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_blue focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Proveedor
                    </label>
                    <input
                      type="text"
                      value={item.vendor}
                      onChange={(e) => updateExpenseItem(index, 'vendor', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_blue focus:border-transparent text-sm"
                      placeholder="Nombre del proveedor"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      📄 Boleta/Recibo
                    </label>
                    {/* Debug logging */}
                    {console.log(`🔍 Receipt check for item ${index}:`, { receipt_url: item.receipt_url, receipt_filename: item.receipt_filename })}
                    {item.receipt_url ? (
                      <div className="space-y-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        {/* Receipt uploaded indicator */}
                        <div className="flex items-center">
                          <FileText size={20} className="text-green-600 mr-3" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-green-800 truncate" title={item.receipt_filename}>
                              ✅ {item.receipt_filename || 'Archivo subido'}
                            </p>
                            <p className="text-xs text-green-600">Boleta subida correctamente</p>
                          </div>
                        </div>
                        
                        {/* Action buttons */}
                        <div className="flex gap-2">
                          <a 
                            href={item.receipt_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center px-3 py-2 text-sm bg-blue-600 text-white border border-blue-600 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                            title="Ver boleta"
                          >
                            <Eye size={14} className="mr-2" />
                            Ver Boleta
                          </a>
                          <button
                            type="button"
                            onClick={() => handleReceiptDelete(index)}
                            className="flex items-center px-3 py-2 text-sm bg-red-600 text-white border border-red-600 rounded-lg hover:bg-red-700 transition-colors font-medium"
                            title="Eliminar y reemplazar"
                          >
                            <Trash2 size={14} className="mr-2" />
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="cursor-pointer block">
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleReceiptUpload(index, file);
                          }}
                          className="hidden"
                        />
                        <div className="flex items-center justify-center w-full p-4 border-2 border-dashed border-gray-400 rounded-lg hover:border-brand_blue hover:bg-blue-50 transition-all duration-200">
                          {uploadingReceipts.has(index) ? (
                            <div className="flex items-center text-brand_blue">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand_blue mr-3"></div>
                              <span className="font-medium">Subiendo archivo...</span>
                            </div>
                          ) : (
                            <div className="text-center">
                              <Upload size={24} className="mx-auto text-gray-500 mb-2" />
                              <p className="text-sm text-gray-700 font-medium">
                                <span className="text-brand_blue">Hacer clic para subir boleta</span>
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                PDF, JPG, PNG (máx. 50MB)
                              </p>
                            </div>
                          )}
                        </div>
                      </label>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Notas
                  </label>
                  <textarea
                    value={item.notes}
                    onChange={(e) => updateExpenseItem(index, 'notes', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_blue focus:border-transparent text-sm"
                    rows={2}
                    placeholder="Notas adicionales sobre este gasto"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          
          <button
            type="button"
            onClick={handleSaveReport}
            disabled={loading}
            className="flex items-center px-6 py-2 bg-brand_yellow text-brand_blue rounded-lg hover:bg-brand_yellow/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand_blue mr-2"></div>
                Guardando...
              </>
            ) : (
              <>
                <Save size={16} className="mr-2" />
                {editingReport ? 'Actualizar Reporte' : 'Guardar Reporte'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}