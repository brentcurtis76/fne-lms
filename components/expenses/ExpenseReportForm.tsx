import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useState, useEffect, useRef } from 'react';

import { Plus, Trash2, Save, Calendar, DollarSign, Upload, X, Eye, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { convertToCLP, formatCurrency, getAvailableCurrencies } from '../../lib/currency-service';
import { RECEIPTS_BUCKET } from '../../utils/expenseConfig';
import { receiptPathFromStored, receiptExtensionFromFileName } from '../../lib/expenses/receipt-path';
import { parseEsCl } from '../../lib/money/parse-es-cl';

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
  currency: 'CLP' | 'USD' | 'EUR' | 'GBP';
  conversion_rate?: number;
  expense_date: string;
  vendor: string;
  expense_number: string;
  notes: string;
  receipt_file?: File;
  receipt_url?: string;
  receipt_filename?: string;
  // GES-3.32: the amount as typed (pesos or the foreign currency), read with parseEsCl.
  amountText?: string;
}

const PESOS_NO_DECIMALS = 'Los montos en pesos no llevan decimales.';
const FOREIGN_TWO_DECIMALS = 'Los montos en moneda extranjera llevan hasta dos decimales.';

/**
 * GES-3.32: reads an amount typed the Chilean way with lib/money/parse-es-cl:
 * pesos without decimals («15.990» is 15990), a foreign currency with up to
 * two. Returns the value, or the sentence that refuses it ('' = not readable).
 */
export function readTypedAmount(
  text: string,
  currency: ExpenseItemForm['currency'] | undefined
): { value: number | null; problem: string | null } {
  if (!text.trim()) return { value: null, problem: null };
  const pesos = !currency || currency === 'CLP';
  const value = parseEsCl(text, { decimals: pesos ? 0 : 2 });
  if (value !== null) return { value, problem: null };
  // A number with more decimals than the currency takes gets its own sentence.
  if (parseEsCl(text, { decimals: 10 }) !== null) {
    return { value: null, problem: pesos ? PESOS_NO_DECIMALS : FOREIGN_TWO_DECIMALS };
  }
  return { value: null, problem: '' };
}

/** GES-3.27: a row nobody filled in (dropped silently when saving). */
function isEmptyRow(item: ExpenseItemForm): boolean {
  return !item.id
    && !item.description.trim()
    && !item.category_id
    && !item.expense_date
    && !(item.amount > 0)
    && !(item.amountText || '').trim()
    && (!item.currency || item.currency === 'CLP')
    && !item.vendor.trim()
    && !item.expense_number.trim()
    && !item.notes.trim()
    && !item.receipt_url
    && !item.receipt_filename;
}

/**
 * GES-3.27: the sentences that stop the save for one row (number = 1-based),
 * e.g. «El gasto 3 no tiene categoría.»; empty when the row can be saved.
 */
export function rowProblems(item: ExpenseItemForm, number: number): string[] {
  const out: string[] = [];
  const typed = item.amountText !== undefined ? readTypedAmount(item.amountText, item.currency) : null;
  if (!item.description.trim()) out.push(`El gasto ${number} no tiene descripción.`);
  if (!item.category_id) out.push(`El gasto ${number} no tiene categoría.`);
  if (typed?.problem) {
    out.push(`El gasto ${number}: ${typed.problem}`);
  } else if (!(item.amount > 0) || (typed !== null && !(typed.value !== null && typed.value > 0))) {
    out.push(`El gasto ${number} no tiene monto.`);
  }
  if (!item.expense_date) out.push(`El gasto ${number} no tiene fecha.`);
  return out;
}

interface ExpenseReportFormProps {
  categories: ExpenseCategory[];
  editingReport?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * The currency dropdown selects the receipt's SOURCE (original) currency — it is
 * NOT a display-currency toggle. So the amount to convert from is always the raw
 * amount currently shown in the input: `original_amount ?? amount` for a foreign
 * item, or `amount` for a CLP item. That raw value is then converted FROM the
 * newly selected currency, which keeps a GBP→CLP→GBP round-trip stable (£12.50
 * stays £12.50) instead of treating the converted CLP magnitude as a new source.
 * The result depends only on the prior item and whether amount or currency
 * changed — never on the target currency.
 */
export function conversionSourceAmount(
  prev: Pick<ExpenseItemForm, 'currency' | 'amount' | 'original_amount'>,
  field: 'amount' | 'currency',
  typedAmount?: number
): number {
  // A newly typed amount is already in the item's current source currency.
  if (field === 'amount') return typedAmount ?? 0;
  // A currency switch re-reads the raw source amount shown in the input.
  return prev.currency && prev.currency !== 'CLP'
    ? prev.original_amount ?? prev.amount ?? 0
    : prev.amount ?? 0;
}

/** The fields of `next` that differ from `prev` (by reference). */
function changesOf(prev: ExpenseItemForm | undefined, next: ExpenseItemForm): Partial<ExpenseItemForm> {
  const out: Partial<ExpenseItemForm> = {};
  (Object.keys(next) as Array<keyof ExpenseItemForm>).forEach((key) => {
    if (!prev || prev[key] !== next[key]) (out as any)[key] = next[key];
  });
  return out;
}

export default function ExpenseReportForm({ categories, editingReport, onSuccess, onCancel }: ExpenseReportFormProps) {
  const supabase = useSupabaseClient();
  const [loading, setLoading] = useState(false);
  const [uploadingReceipts, setUploadingReceipts] = useState<Set<number>>(new Set());
  // GES-1.5: a just-chosen receipt is shown from the browser's own copy (an
  // object URL), keyed by its stored place, until the expense is saved.
  const localReceiptUrls = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const urls = localReceiptUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);
  
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
      expense_number: '',
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
          currency: item.currency || 'CLP', // Default to CLP for existing reports
          original_amount: item.original_amount || item.amount || 0, // Use amount as fallback
          conversion_rate: item.conversion_rate || 1.0,
          expense_date: item.expense_date || '',
          vendor: item.vendor || '',
          expense_number: item.expense_number || '',
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
      expense_number: '',
      notes: ''
    }]);
  };

  const removeExpenseItem = (index: number) => {
    if (expenseItems.length > 1) {
      setExpenseItems(expenseItems.filter((_, i) => i !== index));
    }
  };

  const updateExpenseItem = async (
    index: number,
    field: keyof ExpenseItemForm,
    value: any,
    extra: Partial<ExpenseItemForm> = {}
  ) => {
    const previousItem = expenseItems[index];
    const updatedItems = [...expenseItems];
    updatedItems[index] = { ...previousItem, [field]: value, ...extra };

    // If currency or amount changed, recompute the CLP conversion from the raw
    // source-currency amount (not the stored CLP value — see conversionSourceAmount).
    if (field === 'currency' || field === 'amount') {
      const item = updatedItems[index];
      const sourceAmount = conversionSourceAmount(previousItem, field, value);
      if (sourceAmount > 0 && item.currency) {
        try {
          const conversion = await convertToCLP(sourceAmount, item.currency);
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

    // Only this row's changed fields are merged into the latest state, so a
    // conversion that resolves later does not put back an older copy.
    const changes = updatedItems[index];
    setExpenseItems(prev => prev.map((it, i) => (i === index ? { ...it, ...changesOf(previousItem, changes) } : it)));
  };

  const handleReceiptUpload = async (index: number, file: File) => {
    if (!file) return;

    setUploadingReceipts(prev => new Set(prev).add(index));

    try {
      // Upload file to Supabase Storage
      const fileExt = receiptExtensionFromFileName(file.name);
      const fileName = `receipt_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // GES-1.5: store the file's place in the receipts store, never a link.
      const storedPlace = `${RECEIPTS_BUCKET}/${fileName}`;
      localReceiptUrls.current.set(storedPlace, URL.createObjectURL(file));
      
      // Update the form state in a single update to avoid race conditions
      const updatedItems = [...expenseItems];
      updatedItems[index] = {
        ...updatedItems[index],
        receipt_url: storedPlace,
        receipt_filename: file.name
      };
      setExpenseItems(updatedItems);
      
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
      // The file's place in the receipts store (a stored place or an old link);
      // a value that names no file there skips the storage removal.
      const fileName = receiptPathFromStored(item.receipt_url);

      if (fileName) {
        // Delete from Supabase Storage
        const { error: deleteError } = await supabase.storage
          .from(RECEIPTS_BUCKET)
          .remove([fileName]);

        if (deleteError) {
          console.error('❌ Error deleting file from storage:', deleteError);
          toast.error('Error al eliminar la boleta del servidor: ' + deleteError.message);
          return;
        }
      }

      // If this is a saved item (has an ID), update the database
      if (item.id) {
        const { error: dbError } = await supabase
          .from('expense_items')
          .update({
            receipt_url: null,
            receipt_filename: null
          })
          .eq('id', item.id);

        if (dbError) {
          console.error('❌ Error updating database:', dbError);
          toast.error('Error al actualizar la base de datos');
          return;
        }

        // CRITICAL: Update the editingReport prop to prevent stale data
        if (editingReport && editingReport.expense_items) {
          const itemToUpdate = editingReport.expense_items.find((ei: any) => ei.id === item.id);
          if (itemToUpdate) {
            itemToUpdate.receipt_url = null;
            itemToUpdate.receipt_filename = null;
          }
        }
      }

      // Clear the receipt from the form state
      // Force a complete state refresh by creating entirely new objects
      const updatedItems = expenseItems.map((item, i) => {
        if (i === index) {
          return {
            ...item,
            receipt_url: '',
            receipt_filename: '',
            _forceUpdate: Date.now() // Force React to detect change
          };
        }
        return { ...item }; // Clone other items too to ensure new references
      });
      setExpenseItems(updatedItems);

      const localUrl = localReceiptUrls.current.get(item.receipt_url);
      if (localUrl) {
        URL.revokeObjectURL(localUrl);
        localReceiptUrls.current.delete(item.receipt_url);
      }

      toast.success('Boleta eliminada');

    } catch (error) {
      console.error('❌ Error deleting receipt:', error);
      toast.error('Error al eliminar la boleta');
    }
  };

  // A typed amount: the text is kept as typed; the number follows when readable.
  const updateTypedAmount = (index: number, text: string) => {
    const item = expenseItems[index];
    setExpenseItems(prev => prev.map((it, i) => (i === index ? { ...it, amountText: text } : it)));
    const { value } = readTypedAmount(text, item.currency);
    updateExpenseItem(index, 'amount', value ?? 0, { amountText: text });
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

      // GES-3.27: a row nobody filled in is dropped silently; any other row
      // must be complete, or the save stops and names the row and the field.
      const problems = expenseItems.flatMap((item, index) => (isEmptyRow(item) ? [] : rowProblems(item, index + 1)));
      if (problems.length > 0) {
        toast.error(problems.join(' '));
        return;
      }
      const validItems = expenseItems.filter(item => !isEmptyRow(item));

      if (validItems.length === 0) {
        toast.error('Debe agregar al menos un gasto válido');
        return;
      }

      // The total of a new report counts only the rows that are sent.
      const totalAmount = validItems.reduce((sum, item) => sum + (item.amount || 0), 0);

      if (editingReport) {
        // UPDATE MODE (GES-3.26): one database function, called with the
        // person's own session, saves the report's fields, changes the listed
        // items by id, adds the new ones, removes ONLY the items this form
        // removed (never one added meanwhile, e.g. by the Telegram assistant)
        // and writes the total from the stored items — all or nothing.
        const keptIds = new Set(expenseItems.map(item => item.id).filter(Boolean));
        const removedIds: string[] = (editingReport.expense_items || [])
          .map((item: any) => item.id)
          .filter((id: string | undefined) => id && !keptIds.has(id));

        const { error: saveError } = await supabase.rpc('save_expense_report', {
          p_report_id: editingReport.id,
          p_report: {
            report_name: reportForm.report_name,
            description: reportForm.description || null,
            start_date: reportForm.start_date,
            end_date: reportForm.end_date
          },
          p_items: validItems.map(item => ({
            ...(item.id ? { id: item.id } : {}),
            category_id: item.category_id,
            description: item.description,
            amount: item.amount,
            original_amount: item.original_amount || item.amount,
            currency: item.currency || 'CLP',
            conversion_rate: item.conversion_rate || 1.0,
            // Kept by the database when amount, currency and rate did not change.
            conversion_date: new Date().toISOString().split('T')[0],
            expense_date: item.expense_date,
            vendor: item.vendor || null,
            expense_number: item.expense_number || null,
            receipt_url: item.receipt_url || null,
            receipt_filename: item.receipt_filename || null,
            notes: item.notes || null
          })),
          p_removed: removedIds
        });

        if (saveError) throw saveError;

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
          expense_number: item.expense_number || null,
          receipt_url: item.receipt_url || null,
          receipt_filename: item.receipt_filename || null,
          notes: item.notes || null
        }));

        const { error: itemsError } = await supabase
          .from('expense_items')
          .insert(itemsData);

        if (itemsError) throw itemsError;

        // Same server-side recompute as update mode — DB is the source of truth.
        const { error: totalError } = await supabase.rpc('recompute_expense_report_total', {
          p_report_id: newReport.id
        });
        if (totalError) console.error('Error recomputing report total:', totalError);

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
        <h2 className="text-xl font-semibold text-brand_primary">
          {editingReport ? 'Editar Reporte de Gastos' : 'Nuevo Reporte de Gastos'}
        </h2>
      </div>

      <div className="p-6 space-y-6">
        {/* Report Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-brand_primary border-b pb-2">Información del Reporte</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre del Reporte *
              </label>
              <input
                type="text"
                value={reportForm.report_name}
                onChange={(e) => setReportForm({ ...reportForm, report_name: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
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
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
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
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
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
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                min={reportForm.start_date}
              />
            </div>
          </div>
        </div>

        {/* Expense Items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-brand_primary border-b pb-2">Gastos</h3>
            <button
              type="button"
              onClick={addExpenseItem}
              className="flex items-center px-4 py-2 bg-brand_primary text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
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
                  <h4 className="font-semibold text-brand_primary">Gasto {index + 1}</h4>
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

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Categoría *
                    </label>
                    <select
                      value={item.category_id}
                      onChange={(e) => updateExpenseItem(index, 'category_id', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_accent focus:border-transparent text-sm"
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
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_accent focus:border-transparent text-sm"
                      placeholder="Descripción del gasto"
                    />
                  </div>

                  <div className="p-2 bg-brand_beige rounded-lg border border-brand_accent">
                    <label className="block text-sm font-medium text-brand_primary mb-2">
                      💰 Moneda *
                    </label>
                    <select
                      value={item.currency}
                      onChange={(e) => updateExpenseItem(index, 'currency', e.target.value as 'CLP' | 'USD' | 'EUR' | 'GBP')}
                      className="w-full p-3 border-2 border-brand_accent rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-brand_accent text-sm font-medium bg-white"
                    >
                      {getAvailableCurrencies().map(currency => (
                        <option key={currency.code} value={currency.code}>
                          {currency.symbol} {currency.code} - {currency.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-2 bg-brand_beige rounded-lg border border-brand_accent">
                    <label className="block text-sm font-medium text-brand_primary mb-2">
                      💵 Monto ({item.currency}) *
                    </label>
                    <div className="space-y-2">
                      <input
                        type="text"
                        inputMode={(item.currency === 'CLP' || !item.currency) ? 'numeric' : 'decimal'}
                        data-testid="expense-amount-input"
                        value={item.amountText !== undefined
                          ? item.amountText
                          : String(((item.currency === 'CLP' || !item.currency) ? item.amount : item.original_amount) || '')}
                        onChange={(e) => updateTypedAmount(index, e.target.value)}
                        className="w-full p-3 border-2 border-brand_accent rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-brand_accent text-sm font-medium bg-white"
                        placeholder={(item.currency === 'CLP' || !item.currency) ? '0' : '0,00'}
                      />
                      {item.amountText !== undefined && readTypedAmount(item.amountText, item.currency).problem ? (
                        <p className="text-xs text-red-600">{readTypedAmount(item.amountText, item.currency).problem}</p>
                      ) : null}
                      {item.currency !== 'CLP' && item.conversion_rate && item.original_amount && (
                        <div className="text-sm text-amber-700 font-medium bg-amber-100 p-2 rounded">
                          ≈ ${Math.round((item.original_amount || 0) * (item.conversion_rate || 1)).toLocaleString('es-CL')} CLP
                          <span className="text-xs text-amber-600 block">Tasa: {item.conversion_rate?.toFixed(2)}</span>
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
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_accent focus:border-transparent text-sm"
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
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_accent focus:border-transparent text-sm"
                      placeholder="Nombre del proveedor"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Número de Factura/Boleta
                    </label>
                    <input
                      type="text"
                      value={item.expense_number}
                      onChange={(e) => updateExpenseItem(index, 'expense_number', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_accent focus:border-transparent text-sm"
                      placeholder="Ej: 12345, B-001, F-4567"
                    />
                  </div>

                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      📄 Boleta/Recibo
                    </label>
                    {(item.receipt_url || item.receipt_filename) ? (
                      <div className="space-y-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        {/* Receipt uploaded indicator */}
                        <div className="flex items-center">
                          <FileText size={20} className="text-brand_accent mr-3" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-amber-800 truncate" title={item.receipt_filename}>
                              ✅ {item.receipt_filename || 'Archivo subido'}
                            </p>
                            <p className="text-xs text-amber-600">Boleta subida correctamente</p>
                          </div>
                        </div>
                        
                        {/* Action buttons */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                // GES-1.5: a just-chosen file opens from the browser's
                                // copy; a saved expense asks the server route.
                                let url = item.receipt_url ? localReceiptUrls.current.get(item.receipt_url) || '' : '';
                                if (!url && item.id) {
                                  const response = await fetch('/api/expense-reports/receipt-link?itemId=' + item.id, {
                                    credentials: 'same-origin'
                                  });
                                  if (response.ok) {
                                    const body = await response.json();
                                    if (typeof body?.url === 'string') url = body.url;
                                  }
                                }
                                
                                if (url) {
                                  window.open(url, '_blank');
                                } else {
                                  toast.error('No se pudo abrir la boleta');
                                }
                              } catch (error) {
                                console.error('Error opening receipt:', error);
                                toast.error('Error al abrir la boleta');
                              }
                            }}
                            className="flex items-center px-3 py-2 text-sm bg-brand_primary text-white border border-brand_primary rounded-lg hover:bg-gray-800 transition-colors font-medium"
                            title="Ver boleta"
                          >
                            <Eye size={14} className="mr-2" />
                            Ver Boleta
                          </button>
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
                        <div className="flex items-center justify-center w-full p-4 border-2 border-dashed border-gray-400 rounded-lg hover:border-brand_accent hover:bg-brand_beige transition-all duration-200">
                          {uploadingReceipts.has(index) ? (
                            <div className="flex items-center text-brand_primary">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand_primary mr-3"></div>
                              <span className="font-medium">Subiendo archivo...</span>
                            </div>
                          ) : (
                            <div className="text-center">
                              <Upload size={24} className="mx-auto text-gray-500 mb-2" />
                              <p className="text-sm text-gray-700 font-medium">
                                <span className="text-brand_primary">Hacer clic para subir boleta</span>
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

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Notas
                    </label>
                    <textarea
                      value={item.notes}
                      onChange={(e) => updateExpenseItem(index, 'notes', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_accent focus:border-transparent text-sm"
                      rows={6}
                      placeholder="Notas adicionales sobre este gasto"
                    />
                  </div>
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
            className="flex items-center px-6 py-2 bg-brand_accent text-brand_primary rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand_primary mr-2"></div>
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