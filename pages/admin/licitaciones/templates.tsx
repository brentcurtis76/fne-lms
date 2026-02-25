import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Edit, ChevronDown, ChevronUp, Plus, Trash2, Clock, RotateCcw } from 'lucide-react';
import { ProgramaBasesTemplate, BasesTemplateInput } from '@/types/licitaciones';

interface ProgramaWithTemplates {
  programa: { id: string; nombre: string };
  templates: ProgramaBasesTemplate[];
}

// AC-5: added focus:ring-offset-2
const INPUT_CLASS = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:outline-none w-full';
const BTN_PRIMARY = 'px-4 py-2 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2';
const BTN_SECONDARY = 'px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2';

// Array editor for JSONB string arrays
function ArrayEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (val: string[]) => void;
}) {
  const addItem = () => onChange([...value, '']);
  const updateItem = (idx: number, v: string) => {
    const next = [...value];
    next[idx] = v;
    onChange(next);
  };
  const removeItem = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div>
      <p className="block text-xs font-medium text-gray-600 mb-1">{label}</p>
      <div className="space-y-2">
        {value.map((item, idx) => (
          <div key={idx} className="flex gap-2">
            <input
              type="text"
              id={`array-${label.toLowerCase().replace(/\s+/g, '-')}-${idx}`}
              value={item}
              onChange={e => updateItem(idx, e.target.value)}
              placeholder={`${label} ${idx + 1}`}
              className={INPUT_CLASS}
              aria-label={`${label} ${idx + 1}`}
            />
            <button
              type="button"
              onClick={() => removeItem(idx)}
              className="text-red-500 hover:text-red-700 flex-shrink-0"
              title="Eliminar"
              aria-label={`Eliminar ${label} ${idx + 1}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {/* BC-3: changed from text-blue-600 hover:text-blue-800 */}
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900"
        >
          <Plus size={12} />
          Agregar item
        </button>
      </div>
    </div>
  );
}

// HTML preview of template content
function TemplatePreview({ template }: { template: BasesTemplateInput }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-3">
      <h3 className="font-bold text-lg text-gray-900">BASES DE LICITACION</h3>
      <h4 className="font-semibold text-gray-800">{template.nombre_servicio}</h4>

      <div>
        <p className="font-semibold text-gray-700 mb-1">Objetivo:</p>
        <p className="text-gray-600 whitespace-pre-wrap">{template.objetivo}</p>
      </div>

      {template.objetivos_especificos.length > 0 && (
        <div>
          <p className="font-semibold text-gray-700 mb-1">Objetivos Especificos:</p>
          <ul className="list-disc list-inside space-y-1">
            {template.objetivos_especificos.filter(Boolean).map((obj, i) => (
              <li key={i} className="text-gray-600">{obj}</li>
            ))}
          </ul>
        </div>
      )}

      {template.especificaciones_admin.frecuencia && (
        <div>
          <p className="font-semibold text-gray-700 mb-1">Especificaciones Administrativas:</p>
          <div className="space-y-1 text-gray-600">
            <p><strong>Frecuencia:</strong> {template.especificaciones_admin.frecuencia}</p>
            <p><strong>Lugar:</strong> {template.especificaciones_admin.lugar}</p>
            <p><strong>Contrapartes:</strong> {template.especificaciones_admin.contrapartes_tecnicas}</p>
            <p><strong>Condiciones de pago:</strong> {template.especificaciones_admin.condiciones_pago}</p>
          </div>
        </div>
      )}

      {template.resultados_esperados.length > 0 && (
        <div>
          <p className="font-semibold text-gray-700 mb-1">Resultados Esperados:</p>
          <ul className="list-disc list-inside space-y-1">
            {template.resultados_esperados.filter(Boolean).map((r, i) => (
              <li key={i} className="text-gray-600">{r}</li>
            ))}
          </ul>
        </div>
      )}

      {template.requisitos_ate.length > 0 && (
        <div>
          <p className="font-semibold text-gray-700 mb-1">Requisitos ATE:</p>
          <ul className="list-disc list-inside space-y-1">
            {template.requisitos_ate.filter(Boolean).map((r, i) => (
              <li key={i} className="text-gray-600">{r}</li>
            ))}
          </ul>
        </div>
      )}

      {template.documentos_adjuntar.length > 0 && (
        <div>
          <p className="font-semibold text-gray-700 mb-1">Documentos a Adjuntar:</p>
          <ul className="list-disc list-inside space-y-1">
            {template.documentos_adjuntar.filter(Boolean).map((d, i) => (
              <li key={i} className="text-gray-600">{d}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Inline toggle switch
function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 ${
        checked ? 'bg-green-500' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function LicitacionesTemplatesPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [authReady, setAuthReady] = useState(false);

  const [programas, setProgramas] = useState<ProgramaWithTemplates[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state — REQ-2: programa filter dropdown
  const [filterProgramaId, setFilterProgramaId] = useState<string>('');

  // Toggle loading per template id
  const [togglingTemplateId, setTogglingTemplateId] = useState<string | null>(null);

  // Expanded version history per programa id
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());

  // Edit state
  const [editingProgramaId, setEditingProgramaId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Form state
  const [editForm, setEditForm] = useState<BasesTemplateInput>({
    nombre_servicio: '',
    objetivo: '',
    objetivos_especificos: [],
    especificaciones_admin: {
      frecuencia: '',
      lugar: '',
      contrapartes_tecnicas: '',
      condiciones_pago: '',
    },
    resultados_esperados: [],
    requisitos_ate: [],
    documentos_adjuntar: [],
    condiciones_pago: '',
  });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (authReady && isAdmin) {
      fetchTemplates();
    }
  }, [authReady, isAdmin]);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/auth/my-roles');
      const rolesData = await response.json();
      const roles: string[] = (rolesData.roles || rolesData.data?.roles || []).map((r: { role_type: string }) => r.role_type);
      const adminAccess = roles.includes('admin');

      if (!adminAccess) {
        toast.error('Solo administradores pueden acceder a esta pagina');
        router.push('/dashboard');
        return;
      }

      setCurrentUser(user);
      setIsAdmin(true);
      setUserRole('admin');
      setAuthReady(true);
    } catch {
      router.push('/login');
    }
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/licitaciones/templates');
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al cargar plantillas');
        return;
      }
      setProgramas(json.data?.programas || []);
    } catch {
      toast.error('Error al cargar plantillas');
    } finally {
      setLoading(false);
    }
  };

  // REQ-1: Toggle is_active on a template
  const handleToggleActive = async (templateId: string, newValue: boolean) => {
    setTogglingTemplateId(templateId);
    try {
      const res = await fetch('/api/admin/licitaciones/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, is_active: newValue }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al actualizar estado');
        return;
      }
      toast.success(newValue ? 'Plantilla activada' : 'Plantilla desactivada');
      // Re-fetch to get correct state for all versions (activating one deactivates siblings)
      await fetchTemplates();
    } catch {
      toast.error('Error al actualizar estado de la plantilla');
    } finally {
      setTogglingTemplateId(null);
    }
  };

  // Toggle version history visibility for a programa
  const toggleHistory = (programaId: string) => {
    setExpandedHistory(prev => {
      const next = new Set(prev);
      if (next.has(programaId)) {
        next.delete(programaId);
      } else {
        next.add(programaId);
      }
      return next;
    });
  };

  const startEditing = (item: ProgramaWithTemplates) => {
    setEditingProgramaId(item.programa.id);
    const t = item.templates.find(t => t.is_active) || item.templates[0] || null;
    if (t) {
      setEditForm({
        nombre_servicio: t.nombre_servicio,
        objetivo: t.objetivo,
        objetivos_especificos: Array.isArray(t.objetivos_especificos) ? t.objetivos_especificos : [],
        especificaciones_admin: {
          frecuencia: t.especificaciones_admin?.frecuencia || '',
          lugar: t.especificaciones_admin?.lugar || '',
          contrapartes_tecnicas: t.especificaciones_admin?.contrapartes_tecnicas || '',
          condiciones_pago: t.especificaciones_admin?.condiciones_pago || '',
        },
        resultados_esperados: Array.isArray(t.resultados_esperados) ? t.resultados_esperados : [],
        requisitos_ate: Array.isArray(t.requisitos_ate) ? t.requisitos_ate : [],
        documentos_adjuntar: Array.isArray(t.documentos_adjuntar) ? t.documentos_adjuntar : [],
        condiciones_pago: t.condiciones_pago || '',
      });
    } else {
      setEditForm({
        nombre_servicio: '',
        objetivo: '',
        objetivos_especificos: [''],
        especificaciones_admin: { frecuencia: '', lugar: '', contrapartes_tecnicas: '', condiciones_pago: '' },
        resultados_esperados: [''],
        requisitos_ate: [''],
        documentos_adjuntar: [''],
        condiciones_pago: '',
      });
    }
    setShowPreview(false);
  };

  const handleSave = async () => {
    if (!editingProgramaId) return;

    // Basic validation
    if (!editForm.nombre_servicio.trim()) {
      toast.error('El nombre del servicio es requerido');
      return;
    }
    if (!editForm.objetivo.trim()) {
      toast.error('El objetivo es requerido');
      return;
    }
    const filteredForm = {
      ...editForm,
      objetivos_especificos: editForm.objetivos_especificos.filter(Boolean),
      resultados_esperados: editForm.resultados_esperados.filter(Boolean),
      requisitos_ate: editForm.requisitos_ate.filter(Boolean),
      documentos_adjuntar: editForm.documentos_adjuntar.filter(Boolean),
    };
    if (filteredForm.objetivos_especificos.length === 0) {
      toast.error('Debe ingresar al menos un objetivo especifico');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/licitaciones/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programa_id: editingProgramaId, ...filteredForm }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al guardar plantilla');
        return;
      }

      toast.success('Plantilla guardada como nueva version');
      setEditingProgramaId(null);
      fetchTemplates();
    } catch {
      toast.error('Error al guardar plantilla');
    } finally {
      setSaving(false);
    }
  };

  // REQ-2: Client-side filter by programa
  const filteredProgramas = filterProgramaId
    ? programas.filter(item => item.programa.id === filterProgramaId)
    : programas;

  if (!authReady || loading) {
    return (
      <MainLayout
        user={currentUser as Parameters<typeof MainLayout>[0]['user']}
        currentPage="licitaciones-templates"
        pageTitle="Plantillas Licitaciones"
        isAdmin={true}
        userRole={userRole}
      >
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      user={currentUser as Parameters<typeof MainLayout>[0]['user']}
      currentPage="licitaciones-templates"
      pageTitle="Plantillas Licitaciones"
      isAdmin={isAdmin}
      userRole={userRole}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => router.push('/licitaciones')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft size={18} className="mr-1" />
          Volver a Licitaciones
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Plantillas de Bases</h1>
          <p className="text-sm text-gray-600 mt-1">
            Gestione las plantillas de Bases para cada programa. Cada guardado crea una nueva version y archiva la anterior.
          </p>
        </div>

        {/* REQ-2: Programa filter dropdown */}
        <div className="mb-4 flex items-center gap-3">
          <label htmlFor="filter-programa" className="text-sm font-medium text-gray-700 whitespace-nowrap">
            Filtrar por programa:
          </label>
          <select
            id="filter-programa"
            value={filterProgramaId}
            onChange={e => setFilterProgramaId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:outline-none"
          >
            <option value="">Todos los programas</option>
            {programas.map(item => (
              <option key={item.programa.id} value={item.programa.id}>
                {item.programa.nombre}
              </option>
            ))}
          </select>
          {filterProgramaId && (
            <button
              type="button"
              onClick={() => setFilterProgramaId('')}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              Limpiar filtro
            </button>
          )}
        </div>

        <div className="space-y-4">
          {filteredProgramas.map(item => {
            const activeTemplate = item.templates.find(t => t.is_active) || null;
            const inactiveTemplates = item.templates.filter(t => !t.is_active);
            const historyExpanded = expandedHistory.has(item.programa.id);

            return (
            <div key={item.programa.id} className="bg-white rounded-lg shadow border border-gray-200">
              {/* Program header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-4">
                  {/* REQ-1: is_active toggle */}
                  {activeTemplate && (
                    <div className="flex items-center gap-2">
                      <ToggleSwitch
                        checked={activeTemplate.is_active}
                        onChange={val => handleToggleActive(activeTemplate.id, val)}
                        disabled={togglingTemplateId === activeTemplate.id}
                        label={activeTemplate.is_active ? 'Desactivar plantilla' : 'Activar plantilla'}
                      />
                      <span className="text-xs text-gray-500">
                        Activa
                      </span>
                    </div>
                  )}
                  <div>
                    <h2 className="font-semibold text-gray-900">{item.programa.nombre}</h2>
                    {activeTemplate ? (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Version {activeTemplate.version} activa
                        {activeTemplate.nombre_servicio && ` — ${activeTemplate.nombre_servicio}`}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 mt-0.5">Sin plantilla activa</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (editingProgramaId === item.programa.id) {
                      setEditingProgramaId(null);
                    } else {
                      startEditing(item);
                    }
                  }}
                  className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900"
                >
                  <Edit size={14} />
                  {editingProgramaId === item.programa.id ? 'Cerrar editor' : 'Editar plantilla'}
                </button>
              </div>

              {/* Version history section */}
              {inactiveTemplates.length > 0 && (
                <div className="border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => toggleHistory(item.programa.id)}
                    className="w-full flex items-center justify-between px-6 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-inset"
                    aria-expanded={historyExpanded}
                  >
                    <span className="flex items-center gap-2">
                      <Clock size={14} aria-hidden="true" />
                      Historial de versiones ({inactiveTemplates.length})
                    </span>
                    {historyExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {historyExpanded && (
                    <div className="px-6 pb-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                            <th scope="col" className="pb-2 font-medium">Version</th>
                            <th scope="col" className="pb-2 font-medium">Nombre del servicio</th>
                            <th scope="col" className="pb-2 font-medium">Fecha</th>
                            <th scope="col" className="pb-2 font-medium text-right">Accion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {inactiveTemplates.map(t => (
                            <tr key={t.id} className="text-gray-700">
                              <td className="py-2">v{t.version}</td>
                              <td className="py-2 max-w-xs truncate">{t.nombre_servicio || '—'}</td>
                              <td className="py-2 text-gray-500">
                                {t.updated_at ? new Date(t.updated_at).toLocaleDateString('es-CL') : '—'}
                              </td>
                              <td className="py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(t.id, true)}
                                  disabled={togglingTemplateId === t.id}
                                  className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 rounded px-2 py-1"
                                  aria-label={`Reactivar version ${t.version}`}
                                >
                                  <RotateCcw size={12} />
                                  {togglingTemplateId === t.id ? 'Activando...' : 'Reactivar'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Edit form */}
              {editingProgramaId === item.programa.id && (
                <div className="p-6 space-y-4">
                  <div>
                    {/* AC-1: linked label/input for template-nombre-servicio */}
                    <label htmlFor="template-nombre-servicio" className="block text-xs font-medium text-gray-600 mb-1">
                      Nombre del Servicio <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="template-nombre-servicio"
                      type="text"
                      value={editForm.nombre_servicio}
                      onChange={e => setEditForm(f => ({ ...f, nombre_servicio: e.target.value }))}
                      placeholder="Nombre del servicio"
                      className={INPUT_CLASS}
                    />
                  </div>

                  <div>
                    {/* AC-1: linked label/textarea for template-objetivo */}
                    <label htmlFor="template-objetivo" className="block text-xs font-medium text-gray-600 mb-1">
                      Objetivo <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="template-objetivo"
                      value={editForm.objetivo}
                      onChange={e => setEditForm(f => ({ ...f, objetivo: e.target.value }))}
                      rows={4}
                      placeholder="Descripcion del objetivo del servicio"
                      className={INPUT_CLASS}
                    />
                  </div>

                  <ArrayEditor
                    label="Objetivos Especificos"
                    value={editForm.objetivos_especificos}
                    onChange={v => setEditForm(f => ({ ...f, objetivos_especificos: v }))}
                  />

                  <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                    <p className="text-xs font-semibold text-gray-700">Especificaciones Administrativas</p>
                    <div>
                      <label htmlFor="template-frecuencia" className="block text-xs font-medium text-gray-600 mb-1">Frecuencia de Sesiones</label>
                      <textarea
                        id="template-frecuencia"
                        value={editForm.especificaciones_admin.frecuencia || ''}
                        onChange={e => setEditForm(f => ({
                          ...f, especificaciones_admin: { ...f.especificaciones_admin, frecuencia: e.target.value }
                        }))}
                        rows={2}
                        placeholder="Descripcion de la frecuencia de sesiones"
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label htmlFor="template-lugar" className="block text-xs font-medium text-gray-600 mb-1">Lugar de Realizacion</label>
                      <textarea
                        id="template-lugar"
                        value={editForm.especificaciones_admin.lugar || ''}
                        onChange={e => setEditForm(f => ({
                          ...f, especificaciones_admin: { ...f.especificaciones_admin, lugar: e.target.value }
                        }))}
                        rows={2}
                        placeholder="Lugar donde se realizaran las sesiones"
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label htmlFor="template-contrapartes" className="block text-xs font-medium text-gray-600 mb-1">Contrapartes Tecnicas</label>
                      <textarea
                        id="template-contrapartes"
                        value={editForm.especificaciones_admin.contrapartes_tecnicas || ''}
                        onChange={e => setEditForm(f => ({
                          ...f, especificaciones_admin: { ...f.especificaciones_admin, contrapartes_tecnicas: e.target.value }
                        }))}
                        rows={2}
                        placeholder="Descripcion de las contrapartes tecnicas"
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      {/* AC-1: linked label/textarea for template-condiciones-pago */}
                      <label htmlFor="template-condiciones-pago" className="block text-xs font-medium text-gray-600 mb-1">Condiciones de Pago</label>
                      <textarea
                        id="template-condiciones-pago"
                        value={editForm.especificaciones_admin.condiciones_pago || ''}
                        onChange={e => setEditForm(f => ({
                          ...f, especificaciones_admin: { ...f.especificaciones_admin, condiciones_pago: e.target.value }
                        }))}
                        rows={2}
                        placeholder="Condiciones de pago"
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>

                  <ArrayEditor
                    label="Resultados Esperados"
                    value={editForm.resultados_esperados}
                    onChange={v => setEditForm(f => ({ ...f, resultados_esperados: v }))}
                  />

                  <ArrayEditor
                    label="Requisitos ATE"
                    value={editForm.requisitos_ate}
                    onChange={v => setEditForm(f => ({ ...f, requisitos_ate: v }))}
                  />

                  <ArrayEditor
                    label="Documentos a Adjuntar"
                    value={editForm.documentos_adjuntar}
                    onChange={v => setEditForm(f => ({ ...f, documentos_adjuntar: v }))}
                  />

                  <div>
                    <label htmlFor="template-condiciones-pago-detallado" className="block text-xs font-medium text-gray-600 mb-1">
                      Condiciones de Pago (detallado)
                    </label>
                    <textarea
                      id="template-condiciones-pago-detallado"
                      value={editForm.condiciones_pago || ''}
                      onChange={e => setEditForm(f => ({ ...f, condiciones_pago: e.target.value }))}
                      rows={3}
                      placeholder="Condiciones de pago detalladas"
                      className={INPUT_CLASS}
                    />
                  </div>

                  {/* Preview toggle */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowPreview(!showPreview)}
                      className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
                    >
                      {showPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {showPreview ? 'Ocultar vista previa' : 'Ver vista previa del documento'}
                    </button>
                    {showPreview && (
                      <div className="mt-3">
                        <TemplatePreview template={editForm} />
                      </div>
                    )}
                  </div>

                  {/* Save / Cancel */}
                  <div className="flex gap-3 pt-2 border-t border-gray-200">
                    <button onClick={handleSave} disabled={saving} className={BTN_PRIMARY}>
                      {saving ? 'Guardando...' : 'Guardar como nueva version'}
                    </button>
                    <button onClick={() => setEditingProgramaId(null)} className={BTN_SECONDARY}>
                      Cancelar
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Guardar crea una nueva version y desactiva la version anterior. La version anterior queda en el historial.
                  </p>
                </div>
              )}
            </div>
            );
          })}
        </div>

        {filteredProgramas.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {filterProgramaId
              ? 'No se encontro el programa seleccionado.'
              : 'No se encontraron programas activos.'}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
