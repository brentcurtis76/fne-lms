/**
 * ProposalConfigPanel
 * Collapsible admin-only panel on the Licitación detail page.
 * Sections: MINEDUC validation, template/ficha, hours, platform, consultants,
 *           pricing, modules, documents, generate button, history.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Download,
  ExternalLink,
  FileWarning,
  Loader2,
  Copy,
  Globe,
  Eye,
} from 'lucide-react';
import type { LicitacionDetail } from '@/types/licitaciones';
import type {
  PropuestaConsultor,
  PropuestaDocumentoBiblioteca,
  PropuestaPlantilla,
  PropuestaFichaServicio,
  PropuestaContenidoBloque,
  PropuestaGenerada,
  DocumentoTipo,
} from '@/lib/propuestas/types';
import {
  validateProposalConfig,
  type ValidationResult,
  type ValidationConfig,
} from '@/lib/propuestas/validation';
import { ProposalPreview } from './ProposalPreview';
import type { ProposalConfig } from '@/lib/propuestas/generator';

// ============================================================
// TYPES
// ============================================================

interface ModuleConfig {
  nombre: string;
  horas_presenciales: number;
  horas_sincronicas: number;
  horas_asincronicas: number;
  mes?: number;
}

interface PlantillaWithFicha extends PropuestaPlantilla {
  ficha?: { nombre_servicio: string; folio: number } | null;
}

type DocumentoWithExpiry = PropuestaDocumentoBiblioteca & { expired: boolean };
type PropuestaConHistorial = PropuestaGenerada & { download_url: string | null };

// ============================================================
// HELPERS
// ============================================================

const TIPO_LABELS: Record<DocumentoTipo, string> = {
  certificado_pertenencia: 'Cert. Pertenencia',
  evaluaciones_clientes: 'Eval. Clientes',
  carta_recomendacion: 'Carta Rec.',
  ficha_servicio: 'Ficha MINEDUC',
  otro: 'Otro',
};

const TIPO_COLORS: Record<DocumentoTipo, string> = {
  certificado_pertenencia: 'bg-blue-100 text-blue-800',
  evaluaciones_clientes: 'bg-purple-100 text-purple-800',
  carta_recomendacion: 'bg-green-100 text-green-800',
  ficha_servicio: 'bg-yellow-100 text-yellow-800',
  otro: 'bg-gray-100 text-gray-700',
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const INPUT_CLASS =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:outline-none w-full';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

const WEB_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-blue-100 text-blue-700',
  viewed: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
};

const WEB_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  viewed: 'Vista',
  expired: 'Expirada',
};

function isExpiringSoon(fecha_vencimiento: string | null): boolean {
  if (!fecha_vencimiento) return false;
  const venc = new Date(fecha_vencimiento);
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  return venc > new Date() && venc <= soon;
}

// ============================================================
// SECTION HEADER (collapsible sub-sections)
// ============================================================

function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between w-full text-left text-sm font-semibold text-gray-700 py-2 border-b border-gray-200 mb-3 hover:text-gray-900"
    >
      <span>{title}</span>
      {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
  );
}

// ============================================================
// MAIN COMPONENT PROPS
// ============================================================

interface ProposalConfigPanelProps {
  licitacionId: string;
  licitacion: LicitacionDetail;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ProposalConfigPanel({
  licitacionId,
  licitacion,
}: ProposalConfigPanelProps) {
  // Panel open/collapsed
  const [panelOpen, setPanelOpen] = useState(false);

  // Data lists
  const [plantillas, setPlantillas] = useState<PlantillaWithFicha[]>([]);
  const [fichas, setFichas] = useState<PropuestaFichaServicio[]>([]);
  const [consultores, setConsultores] = useState<PropuestaConsultor[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoWithExpiry[]>([]);
  const [bloques, setBloques] = useState<PropuestaContenidoBloque[]>([]);
  const [propuestas, setPropuestas] = useState<PropuestaConHistorial[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Form state
  const [plantillaId, setPlantillaId] = useState('');
  const [fichaId, setFichaId] = useState('');
  const [horasPresenciales, setHorasPresenciales] = useState(0);
  const [horasSincronicas, setHorasSincronicas] = useState(0);
  const [horasAsincronicas, setHorasAsincronicas] = useState(0);
  const [plataforma, setPlataforma] = useState(false);
  const [plataformaBeneficios, setPlataformaBeneficios] = useState('');
  const [consultoresIds, setConsultoresIds] = useState<string[]>([]);
  const [precioModelo, setPrecioModelo] = useState<'per_hour' | 'fixed'>('per_hour');
  const [precioUf, setPrecioUf] = useState('');
  const [fixedUf, setFixedUf] = useState('');
  const [formaPago, setFormaPago] = useState('');
  const [formaPagoDetalle, setFormaPagoDetalle] = useState('');
  const [modulos, setModulos] = useState<ModuleConfig[]>([]);
  const [documentosIds, setDocumentosIds] = useState<string[]>([]);
  const [objetivoGeneral, setObjetivoGeneral] = useState('');

  // Sub-section open states
  const [secHoras, setSecHoras] = useState(true);
  const [secPlataforma, setSecPlataforma] = useState(false);
  const [secConsultores, setSecConsultores] = useState(true);
  const [secPrecio, setSecPrecio] = useState(true);
  const [secModulos, setSecModulos] = useState(false);
  const [secDocumentos, setSecDocumentos] = useState(true);
  const [secHistorial, setSecHistorial] = useState(false);
  const [objetivoExpanded, setObjetivoExpanded] = useState(false);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [lastGenResult, setLastGenResult] = useState<{
    web_slug: string;
    access_code: string;
  } | null>(null);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);

  // ============================================================
  // Load data when panel opens
  // ============================================================

  useEffect(() => {
    if (panelOpen && !dataLoaded) {
      loadAllData();
    }
  }, [panelOpen, dataLoaded]);

  const loadAllData = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        fetch('/api/propuestas/plantillas'),
        fetch('/api/propuestas/fichas'),
        fetch('/api/propuestas/consultores'),
        fetch('/api/propuestas/documentos'),
        fetch('/api/propuestas/bloques'),
        fetch(`/api/licitaciones/${licitacionId}/propuestas`),
      ]);

      const [plantResult, fichaResult, consResult, docResult, bloqResult, propResult] = results;

      async function getJson(result: PromiseSettledResult<Response>, label: string) {
        if (result.status === 'rejected') {
          toast.error(`Error de red al cargar ${label}`);
          return null;
        }
        if (!result.value.ok) return null;
        try {
          return await result.value.json();
        } catch {
          toast.error(`Respuesta inválida al cargar ${label}`);
          return null;
        }
      }

      const [plantJson, fichaJson, consJson, docJson, bloqJson, propJson] = await Promise.all([
        getJson(plantResult, 'plantillas'),
        getJson(fichaResult, 'fichas'),
        getJson(consResult, 'consultores'),
        getJson(docResult, 'documentos'),
        getJson(bloqResult, 'bloques de contenido'),
        getJson(propResult, 'historial de propuestas'),
      ]);

      if (plantJson) setPlantillas(plantJson.data?.plantillas || []);
      if (fichaJson) setFichas(fichaJson.data?.fichas || []);
      if (consJson) setConsultores(consJson.data?.consultores || []);
      if (docJson) setDocumentos(docJson.data?.documentos || []);
      if (bloqJson) setBloques(bloqJson.data?.bloques || []);
      if (propJson) setPropuestas(propJson.data?.propuestas || []);

      setDataLoaded(true);
    } catch {
      toast.error('Error inesperado al cargar datos de configuración');
    }
  }, [licitacionId]);

  // ============================================================
  // Derived state
  // ============================================================

  const selectedPlantilla = useMemo(
    () => plantillas.find(p => p.id === plantillaId) || null,
    [plantillas, plantillaId]
  );

  const selectedFicha = useMemo(
    () => fichas.find(f => f.id === fichaId) || null,
    [fichas, fichaId]
  );

  const selectedConsultores = useMemo(
    () => consultores.filter(c => consultoresIds.includes(c.id)),
    [consultores, consultoresIds]
  );

  const subtotalHoras = horasPresenciales + horasSincronicas;
  const totalHoras = subtotalHoras + horasAsincronicas;

  const precioUfNum = parseFloat(precioUf) || 0;
  const fixedUfNum = parseFloat(fixedUf) || 0;
  const totalUf =
    precioModelo === 'per_hour' ? precioUfNum * totalHoras : fixedUfNum;

  // ============================================================
  // Preview config — passed to ProposalPreview (body-only, no school logo / photos)
  // ============================================================

  const previewConfig: ProposalConfig | null = useMemo(() => {
    if (!selectedPlantilla || !selectedFicha) return null;

    const schoolName =
      licitacion.cliente?.nombre_fantasia || licitacion.school?.name || 'Escuela';

    const plantillaBloques = (selectedPlantilla.bloques_orden || [])
      .map((key) => bloques.find((b) => b.id === key || b.clave === key))
      .filter((b): b is PropuestaContenidoBloque => b !== undefined);

    return {
      type: selectedPlantilla.tipo_servicio === 'preparacion' ? 'preparacion' : 'evoluciona',
      schoolName,
      // schoolLogoPath omitted — Supabase path not accessible as a browser URL
      programYear: licitacion.year,
      serviceName: selectedFicha.nombre_servicio,
      consultants: selectedConsultores.map((c) => ({
        nombre: c.nombre,
        titulo: c.titulo,
        bio: c.perfil_profesional || '',
        // fotoPath omitted — Supabase path not accessible as a browser URL
      })),
      modules: modulos,
      horasPresenciales,
      horasSincronicas,
      horasAsincronicas,
      pricing: {
        mode: precioModelo,
        precioUf: precioUfNum,
        totalHours: totalHoras,
        formaPago: formaPago || '3 cuotas iguales',
        fixedUf: precioModelo === 'fixed' ? fixedUfNum : undefined,
      },
      contentBlocks: plantillaBloques.map((b) => ({
        key: b.clave,
        titulo: b.titulo,
        contenido: b.contenido as { sections: import('@/lib/propuestas/generator').ContentSectionData[] },
        imagenes: b.imagenes || null,
      })),
    };
  }, [
    selectedPlantilla,
    selectedFicha,
    selectedConsultores,
    modulos,
    horasPresenciales,
    horasSincronicas,
    horasAsincronicas,
    precioModelo,
    precioUfNum,
    totalHoras,
    formaPago,
    fixedUfNum,
    bloques,
    licitacion,
  ]);

  // ============================================================
  // MINEDUC live validation
  // ============================================================

  const validationResult: ValidationResult | null = useMemo(() => {
    if (!selectedFicha) return null;

    const config: ValidationConfig = {
      nombre_servicio: selectedFicha.nombre_servicio,
      horas_presenciales: horasPresenciales,
      horas_sincronicas: horasSincronicas,
      horas_asincronicas: horasAsincronicas,
      consultores: selectedConsultores.map(c => ({ nombre: c.nombre })),
      total_hours: totalHoras,
      modules:
        modulos.length > 0
          ? modulos.map(m => ({
              horas_presenciales: m.horas_presenciales,
              horas_sincronicas: m.horas_sincronicas,
              horas_asincronicas: m.horas_asincronicas,
            }))
          : undefined,
      objetivo_general: objetivoGeneral || undefined,
    };

    const selectedDocSnippets = documentos
      .filter(d => documentosIds.includes(d.id))
      .map(d => ({ id: d.id, nombre: d.nombre, fecha_vencimiento: d.fecha_vencimiento }));

    return validateProposalConfig(config, selectedFicha, selectedDocSnippets);
  }, [
    selectedFicha,
    horasPresenciales,
    horasSincronicas,
    horasAsincronicas,
    selectedConsultores,
    totalHoras,
    modulos,
    objetivoGeneral,
    documentos,
    documentosIds,
  ]);

  // ============================================================
  // Plantilla change handler
  // ============================================================

  const handlePlantillaChange = (id: string) => {
    setPlantillaId(id);
    const p = plantillas.find(pl => pl.id === id);
    if (!p) return;

    // Auto-select ficha
    if (p.ficha_id) setFichaId(p.ficha_id);

    // Apply defaults
    const cfg = p.configuracion_default;
    if (cfg) {
      if (cfg.horas_presenciales !== undefined) setHorasPresenciales(cfg.horas_presenciales);
      if (cfg.horas_sincronicas !== undefined) setHorasSincronicas(cfg.horas_sincronicas);
      if (cfg.horas_asincronicas !== undefined) setHorasAsincronicas(cfg.horas_asincronicas);
      if (cfg.precio_uf !== undefined) setPrecioUf(String(cfg.precio_uf));
      if (cfg.precio_modelo !== undefined) setPrecioModelo(cfg.precio_modelo);
      if (cfg.forma_pago !== undefined) setFormaPago(cfg.forma_pago);
      if (cfg.plataforma !== undefined) setPlataforma(cfg.plataforma);
    }
  };

  // ============================================================
  // Consultant toggle
  // ============================================================

  const toggleConsultor = (id: string) => {
    setConsultoresIds(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
  };

  // ============================================================
  // Module helpers
  // ============================================================

  const addModule = () => {
    setModulos(ms => [
      ...ms,
      { nombre: `Módulo ${ms.length + 1}`, horas_presenciales: 0, horas_sincronicas: 0, horas_asincronicas: 0 },
    ]);
  };

  const updateModule = (idx: number, field: keyof ModuleConfig, value: string | number) => {
    setModulos(ms =>
      ms.map((m, i) =>
        i === idx
          ? { ...m, [field]: typeof value === 'string' && field !== 'nombre' ? parseInt(value, 10) || 0 : value }
          : m
      )
    );
  };

  const removeModule = (idx: number) => {
    setModulos(ms => ms.filter((_, i) => i !== idx));
  };

  const moveModule = (idx: number, direction: 'up' | 'down') => {
    setModulos(ms => {
      const next = [...ms];
      const swap = direction === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return ms;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const loadFromPlantilla = () => {
    // Apply configuracion_default hours and reset modules
    if (selectedPlantilla?.configuracion_default) {
      const cfg = selectedPlantilla.configuracion_default;
      if (cfg.horas_presenciales !== undefined) setHorasPresenciales(cfg.horas_presenciales);
      if (cfg.horas_sincronicas !== undefined) setHorasSincronicas(cfg.horas_sincronicas);
      if (cfg.horas_asincronicas !== undefined) setHorasAsincronicas(cfg.horas_asincronicas);
    }
    setModulos([]);
    toast.success('Configuración cargada desde plantilla');
  };

  // ============================================================
  // Document toggle
  // ============================================================

  const toggleDocumento = (id: string) => {
    setDocumentosIds(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
  };

  // ============================================================
  // Clipboard helpers
  // ============================================================

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado al portapapeles`);
    } catch {
      toast.error('Error al copiar');
    }
  };

  // ============================================================
  // Generate
  // ============================================================

  const handleGenerate = async () => {
    if (!plantillaId || !fichaId) {
      toast.error('Seleccione una plantilla y ficha antes de generar');
      return;
    }
    if (!selectedFicha) {
      toast.error('Ficha de servicio no encontrada');
      return;
    }
    if (validationResult && !validationResult.valid) {
      toast.error(
        `Hay ${validationResult.errors.length} error(es) de validación MINEDUC. Corrija antes de generar.`
      );
      return;
    }

    const expiredSelected = documentos.filter(
      d => documentosIds.includes(d.id) && d.expired
    );
    if (expiredSelected.length > 0) {
      toast.error(
        `Hay ${expiredSelected.length} certificado(s) vencido(s) seleccionado(s). Actualícelos antes de generar.`
      );
      return;
    }

    const schoolName =
      licitacion.cliente?.nombre_fantasia || licitacion.school?.name || 'Escuela';

    // Filter bloques by plantilla order
    const plantillaBloques = (selectedPlantilla?.bloques_orden || [])
      .map(key => bloques.find(b => b.id === key || b.clave === key))
      .filter((b): b is PropuestaContenidoBloque => b !== undefined);

    const payload = {
      plantilla_id: plantillaId,
      config: {
        type:
          selectedPlantilla?.tipo_servicio === 'preparacion' ? 'preparacion' : 'evoluciona',
        schoolName,
        programYear: licitacion.year,
        serviceName: selectedFicha.nombre_servicio,
        consultants: selectedConsultores.map(c => ({
          nombre: c.nombre,
          titulo: c.titulo,
          bio: c.perfil_profesional || '',
          fotoPath: c.foto_path || undefined,
        })),
        modules: modulos,
        horasPresenciales,
        horasSincronicas,
        horasAsincronicas,
        pricing: {
          mode: precioModelo,
          precioUf: precioUfNum,
          totalHours: totalHoras,
          formaPago: formaPago || '3 cuotas iguales',
          fixedUf: precioModelo === 'fixed' ? fixedUfNum : undefined,
        },
        contentBlocks: plantillaBloques.map(b => ({
          key: b.clave,
          titulo: b.titulo,
          contenido: b.contenido,
          imagenes: b.imagenes || null,
        })),
        destinatarios: selectedFicha.destinatarios,
      },
      documentos_ids: documentosIds.length > 0 ? documentosIds : undefined,
    };

    setGenerating(true);
    try {
      let res: Response;
      try {
        res = await fetch(`/api/licitaciones/${licitacionId}/generate-propuesta`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        toast.error('Sin conexión al servidor. Verifique su red e intente nuevamente.');
        return;
      }

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Error al generar propuesta');
        return;
      }

      toast.success('Propuesta generada exitosamente');

      // Save web credentials from response
      if (json.data?.web_slug && json.data?.access_code) {
        setLastGenResult({
          web_slug: json.data.web_slug,
          access_code: json.data.access_code,
        });
      }

      // Reload history
      try {
        const histRes = await fetch(`/api/licitaciones/${licitacionId}/propuestas`);
        const histJson = await histRes.json();
        if (histRes.ok) setPropuestas(histJson.data?.propuestas || []);
      } catch {
        // Non-critical: history reload failure should not mask the success message
      }
      setSecHistorial(true);
    } catch {
      toast.error('Error inesperado al generar propuesta');
    } finally {
      setGenerating(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="bg-white rounded-lg shadow mb-6">
      {/* Panel header */}
      <button
        type="button"
        onClick={() => setPanelOpen(o => !o)}
        className="w-full px-6 py-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-yellow-400 text-black text-xs flex items-center justify-center font-bold">
            P
          </span>
          Generar Propuesta FNE
          <span className="ml-1 text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            Solo Admin
          </span>
        </h2>
        {panelOpen ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
      </button>

      {panelOpen && (
        <div className="p-6 space-y-6">
          {!dataLoaded ? (
            <div className="flex justify-center items-center h-24">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
            </div>
          ) : (
            <>
              {/* ── MINEDUC COMPLIANCE PANEL ── */}
              {selectedFicha && validationResult && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
                    Validación MINEDUC
                  </p>
                  <p className="text-xs text-gray-500 mb-3">
                    Ficha: Folio {selectedFicha.folio} — {selectedFicha.nombre_servicio}
                  </p>

                  {/* Rule results */}
                  <div className="space-y-1.5">
                    {/* Rule 1: Nombre */}
                    <ValidationRow
                      pass={!validationResult.errors.some(e => e.rule === 1)}
                      label="Nombre del Servicio"
                      detail={
                        validationResult.errors.find(e => e.rule === 1)?.message ||
                        'coincide con la Ficha'
                      }
                    />
                    {/* Rule 2: Horas */}
                    <ValidationRow
                      pass={!validationResult.errors.some(e => e.rule === 2)}
                      label="Horas presenciales + sincrónicas"
                      detail={
                        validationResult.errors.find(e => e.rule === 2)?.message ||
                        `${subtotalHoras}/${selectedFicha.horas_presenciales} registradas`
                      }
                    />
                    {/* Rule 4: Destinatarios */}
                    <ValidationRow
                      pass={!validationResult.errors.some(e => e.rule === 4)}
                      label="Destinatarios"
                      detail={
                        validationResult.errors.find(e => e.rule === 4)?.message ||
                        selectedFicha.destinatarios.join(', ')
                      }
                    />
                    {/* Rule 5: Consultores */}
                    <ValidationRow
                      pass={!validationResult.errors.some(e => e.rule === 5)}
                      label="Consultores en Ficha"
                      detail={
                        validationResult.errors.find(e => e.rule === 5)?.message ||
                        `${selectedConsultores.length} seleccionado(s)`
                      }
                    />
                    {/* Rule 6: Objetivo (warning) */}
                    {validationResult.warnings.some(w => w.rule === 6) && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => setObjetivoExpanded(o => !o)}
                          className="flex items-center gap-1 text-xs text-yellow-700 hover:text-yellow-900"
                        >
                          <AlertTriangle size={12} />
                          Objetivo General: revisar coherencia
                          <ChevronRight
                            size={12}
                            className={`transition-transform ${objetivoExpanded ? 'rotate-90' : ''}`}
                          />
                        </button>
                        {objetivoExpanded && (
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div className="bg-white border border-gray-200 rounded p-2">
                              <p className="font-medium text-gray-600 mb-1">Ficha MINEDUC:</p>
                              <p className="text-gray-700">
                                {validationResult.warnings.find(w => w.rule === 6)?.fichaValue}
                              </p>
                            </div>
                            <div className="bg-white border border-gray-200 rounded p-2">
                              <p className="font-medium text-gray-600 mb-1">Propuesta:</p>
                              <textarea
                                rows={3}
                                className="w-full text-xs border-0 resize-none focus:outline-none text-gray-700"
                                value={objetivoGeneral}
                                onChange={e => setObjetivoGeneral(e.target.value)}
                                placeholder="Objetivo de la propuesta..."
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Rule 7: Module sum */}
                    {validationResult.errors.some(e => e.rule === 7) && (
                      <ValidationRow
                        pass={false}
                        label="Suma de módulos"
                        detail={
                          validationResult.errors.find(e => e.rule === 7)?.message || ''
                        }
                      />
                    )}
                  </div>

                  {/* Overall status */}
                  <div
                    className={`mt-3 pt-3 border-t border-gray-200 flex items-center gap-2 text-sm font-medium ${
                      validationResult.valid ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {validationResult.valid ? (
                      <>
                        <CheckCircle size={15} />
                        Puede generar
                      </>
                    ) : (
                      <>
                        <XCircle size={15} />
                        No puede generar ({validationResult.errors.length} error
                        {validationResult.errors.length !== 1 ? 'es' : ''})
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── PLANTILLA & FICHA ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Plantilla</label>
                  <select
                    className={INPUT_CLASS}
                    value={plantillaId}
                    onChange={e => handlePlantillaChange(e.target.value)}
                  >
                    <option value="">— Seleccionar —</option>
                    {plantillas.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Ficha de Servicio
                  </label>
                  <select
                    className={INPUT_CLASS}
                    value={fichaId}
                    onChange={e => setFichaId(e.target.value)}
                    disabled={!!plantillaId}
                  >
                    <option value="">— Seleccionar —</option>
                    {fichas.map(f => (
                      <option key={f.id} value={f.id}>
                        Folio {f.folio} — {f.nombre_servicio}
                      </option>
                    ))}
                  </select>
                  {plantillaId && (
                    <p className="text-xs text-gray-400 mt-1">
                      La ficha se determina por la plantilla seleccionada
                    </p>
                  )}
                  {selectedFicha && (
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedFicha.horas_presenciales}h presenciales registradas ·{' '}
                      {selectedFicha.destinatarios.join(', ')}
                    </p>
                  )}
                </div>
              </div>

              {/* ── HORAS ── */}
              <div>
                <SectionHeader
                  title="Configuración de Horas"
                  open={secHoras}
                  onToggle={() => setSecHoras(o => !o)}
                />
                {secHoras && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Presencial (hrs)
                        </label>
                        <input
                          type="number"
                          min="0"
                          className={INPUT_CLASS}
                          value={horasPresenciales}
                          onChange={e =>
                            setHorasPresenciales(parseInt(e.target.value, 10) || 0)
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Online Sincrónica (hrs)
                        </label>
                        <input
                          type="number"
                          min="0"
                          className={INPUT_CLASS}
                          value={horasSincronicas}
                          onChange={e =>
                            setHorasSincronicas(parseInt(e.target.value, 10) || 0)
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Online Asincrónica (hrs)
                        </label>
                        <input
                          type="number"
                          min="0"
                          className={INPUT_CLASS}
                          value={horasAsincronicas}
                          onChange={e =>
                            setHorasAsincronicas(parseInt(e.target.value, 10) || 0)
                          }
                        />
                      </div>
                    </div>
                    <div className="flex gap-6 text-sm">
                      <div
                        className={`flex items-center gap-1 ${
                          selectedFicha && subtotalHoras > selectedFicha.horas_presenciales
                            ? 'text-red-600 font-semibold'
                            : 'text-green-700'
                        }`}
                      >
                        {selectedFicha && subtotalHoras > selectedFicha.horas_presenciales ? (
                          <XCircle size={13} />
                        ) : (
                          <CheckCircle size={13} />
                        )}
                        Subtotal presencial: {subtotalHoras} hrs
                        {selectedFicha && ` (de ${selectedFicha.horas_presenciales} registradas)`}
                      </div>
                      <div className="text-gray-600">
                        Total:{' '}
                        <span className="font-semibold">{totalHoras} hrs</span>
                        {' '}({subtotalHoras} + {horasAsincronicas} asíncronas)
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── PLATAFORMA ── */}
              <div>
                <SectionHeader
                  title="Plataforma de Crecimiento"
                  open={secPlataforma}
                  onToggle={() => setSecPlataforma(o => !o)}
                />
                {secPlataforma && (
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={plataforma}
                        onChange={e => setPlataforma(e.target.checked)}
                        className="rounded text-yellow-400 focus:ring-yellow-400"
                      />
                      <span className="text-sm text-gray-700">
                        Incluir acceso a Plataforma de Crecimiento
                      </span>
                    </label>
                    {plataforma && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Beneficios de la plataforma
                        </label>
                        <textarea
                          rows={2}
                          className={INPUT_CLASS}
                          value={plataformaBeneficios}
                          onChange={e => setPlataformaBeneficios(e.target.value)}
                          placeholder="Ej: Contenidos audiovisuales, formación cruzada, gestión del conocimiento interno"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── CONSULTORES ── */}
              <div>
                <SectionHeader
                  title={`Equipo Consultor (${consultoresIds.length} seleccionado${consultoresIds.length !== 1 ? 's' : ''})`}
                  open={secConsultores}
                  onToggle={() => setSecConsultores(o => !o)}
                />
                {secConsultores && (
                  <div className="space-y-2">
                    {consultores.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No hay consultores.{' '}
                        <a
                          href="/admin/licitaciones/consultores"
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
                        >
                          Agregar consultores <ExternalLink size={11} />
                        </a>
                      </p>
                    ) : (
                      consultores.map(c => {
                        const checked = consultoresIds.includes(c.id);
                        const inFicha = selectedFicha?.equipo_trabajo?.some(m => {
                          const fichaWords = m.nombre.toLowerCase().trim().split(/\s+/);
                          const consultorName = c.nombre.toLowerCase().trim();
                          return fichaWords.every(word => consultorName.includes(word));
                        }) || false;
                        return (
                          <label
                            key={c.id}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                              checked
                                ? 'border-yellow-400 bg-yellow-50'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleConsultor(c.id)}
                              className="rounded text-yellow-400 focus:ring-yellow-400"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900 truncate">
                                  {c.nombre}
                                </span>
                                {inFicha && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">
                                    ✓ en Ficha
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 truncate">{c.titulo}</div>
                            </div>
                            <span className="text-xs text-gray-400 flex-shrink-0 hidden md:block">
                              {c.categoria === 'comite_internacional'
                                ? 'Comité Intl.'
                                : c.categoria === 'equipo_fne'
                                ? 'Equipo FNE'
                                : 'Asesor Intl.'}
                            </span>
                          </label>
                        );
                      })
                    )}
                    {selectedFicha?.equipo_trabajo && (
                      <p className="text-xs text-gray-400 mt-1">
                        Ficha registra {selectedFicha.equipo_trabajo.length} miembro(s) en equipo
                        de trabajo. Se requieren al menos 2 coincidencias.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* ── PRECIO ── */}
              <div>
                <SectionHeader
                  title="Propuesta Económica"
                  open={secPrecio}
                  onToggle={() => setSecPrecio(o => !o)}
                />
                {secPrecio && (
                  <div className="space-y-4">
                    {/* Toggle */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPrecioModelo('per_hour')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          precioModelo === 'per_hour'
                            ? 'bg-yellow-400 text-black'
                            : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Por hora
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrecioModelo('fixed')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          precioModelo === 'fixed'
                            ? 'bg-yellow-400 text-black'
                            : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Precio fijo
                      </button>
                    </div>

                    {precioModelo === 'per_hour' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Valor UF por hora
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className={INPUT_CLASS}
                            value={precioUf}
                            onChange={e => setPrecioUf(e.target.value)}
                            placeholder="Ej: 1.2"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Total calculado
                          </label>
                          <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-sm font-medium text-gray-900">
                            {totalUf.toFixed(2)} UF
                            <span className="text-xs text-gray-400 ml-1">
                              ({precioUfNum} × {totalHoras}h)
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Precio fijo (UF)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className={INPUT_CLASS}
                            value={fixedUf}
                            onChange={e => setFixedUf(e.target.value)}
                            placeholder="Ej: 888"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Total
                          </label>
                          <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-sm font-medium text-gray-900">
                            {fixedUfNum.toFixed(2)} UF
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Forma de pago
                        </label>
                        <select
                          className={INPUT_CLASS}
                          value={formaPago}
                          onChange={e => setFormaPago(e.target.value)}
                        >
                          <option value="">— Seleccionar —</option>
                          <option value="3 cuotas iguales">3 cuotas iguales</option>
                          <option value="2 cuotas iguales">2 cuotas iguales</option>
                          <option value="Pago único">Pago único</option>
                          <option value="Personalizado">Personalizado</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Detalle de pago
                        </label>
                        <input
                          className={INPUT_CLASS}
                          value={formaPagoDetalle}
                          onChange={e => setFormaPagoDetalle(e.target.value)}
                          placeholder="Ej: 33% inicio, 33% julio, 34% noviembre"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── MÓDULOS ── */}
              <div>
                <SectionHeader
                  title="Módulos / Actividades"
                  open={secModulos}
                  onToggle={() => setSecModulos(o => !o)}
                />
                {secModulos && (
                  <div className="space-y-3">
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={loadFromPlantilla}
                        disabled={!selectedPlantilla}
                        className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cargar desde plantilla
                      </button>
                      <button
                        type="button"
                        onClick={addModule}
                        className="flex items-center gap-1 px-3 py-1.5 bg-yellow-400 text-black text-xs rounded-lg hover:bg-yellow-500 font-medium"
                      >
                        <Plus size={12} />
                        Agregar módulo
                      </button>
                    </div>

                    {modulos.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">
                        Sin módulos configurados. Use &ldquo;Cargar desde plantilla&rdquo; o agregue
                        manualmente.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {modulos.map((m, i) => {
                          const mTotal =
                            m.horas_presenciales + m.horas_sincronicas + m.horas_asincronicas;
                          return (
                            <div
                              key={i}
                              className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => moveModule(i, 'up')}
                                    disabled={i === 0}
                                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                  >
                                    <ArrowUp size={11} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveModule(i, 'down')}
                                    disabled={i === modulos.length - 1}
                                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                  >
                                    <ArrowDown size={11} />
                                  </button>
                                </div>
                                <input
                                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-yellow-400 focus:outline-none"
                                  value={m.nombre}
                                  onChange={e => updateModule(i, 'nombre', e.target.value)}
                                  placeholder={`Módulo ${i + 1}`}
                                />
                                <span className="text-xs text-gray-500 flex-shrink-0">
                                  {mTotal}h
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeModule(i)}
                                  className="text-red-400 hover:text-red-600"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-0.5">
                                    Presencial
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-yellow-400 focus:outline-none"
                                    value={m.horas_presenciales}
                                    onChange={e =>
                                      updateModule(i, 'horas_presenciales', e.target.value)
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-0.5">
                                    Sincrónica
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-yellow-400 focus:outline-none"
                                    value={m.horas_sincronicas}
                                    onChange={e =>
                                      updateModule(i, 'horas_sincronicas', e.target.value)
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-0.5">
                                    Asincrónica
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-yellow-400 focus:outline-none"
                                    value={m.horas_asincronicas}
                                    onChange={e =>
                                      updateModule(i, 'horas_asincronicas', e.target.value)
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-0.5">
                                    Mes
                                  </label>
                                  <select
                                    className="w-full border border-gray-200 rounded px-1 py-1 text-xs focus:ring-1 focus:ring-yellow-400 focus:outline-none"
                                    value={m.mes ?? ''}
                                    onChange={e =>
                                      updateModule(
                                        i,
                                        'mes',
                                        e.target.value ? parseInt(e.target.value, 10) : ''
                                      )
                                    }
                                  >
                                    <option value="">—</option>
                                    {MESES.map((mes, mi) => (
                                      <option key={mi + 1} value={mi + 1}>
                                        {mes}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div className="text-xs text-gray-500 text-right pt-1">
                          Suma módulos:{' '}
                          <span
                            className={
                              modulos.reduce(
                                (acc, m) =>
                                  acc +
                                  m.horas_presenciales +
                                  m.horas_sincronicas +
                                  m.horas_asincronicas,
                                0
                              ) !== totalHoras && totalHoras > 0
                                ? 'text-red-600 font-semibold'
                                : 'text-green-700 font-semibold'
                            }
                          >
                            {modulos.reduce(
                              (acc, m) =>
                                acc +
                                m.horas_presenciales +
                                m.horas_sincronicas +
                                m.horas_asincronicas,
                              0
                            )}
                            h
                          </span>{' '}
                          / {totalHoras}h total
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── DOCUMENTOS ── */}
              <div>
                <SectionHeader
                  title={`Documentos Adjuntos (${documentosIds.length} seleccionado${documentosIds.length !== 1 ? 's' : ''})`}
                  open={secDocumentos}
                  onToggle={() => setSecDocumentos(o => !o)}
                />
                {secDocumentos && (
                  <div className="space-y-2">
                    {documentos.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No hay documentos.{' '}
                        <a
                          href="/admin/licitaciones/documentos-propuesta"
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
                        >
                          Subir documentos <ExternalLink size={11} />
                        </a>
                      </p>
                    ) : (
                      documentos.map(doc => {
                        const checked = documentosIds.includes(doc.id);
                        const expiring = isExpiringSoon(doc.fecha_vencimiento);
                        return (
                          <label
                            key={doc.id}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                              doc.expired
                                ? 'border-red-300 bg-red-50'
                                : expiring
                                ? 'border-yellow-300 bg-yellow-50'
                                : checked
                                ? 'border-yellow-400 bg-yellow-50'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={doc.expired}
                              onChange={() => !doc.expired && toggleDocumento(doc.id)}
                              className="rounded text-yellow-400 focus:ring-yellow-400 disabled:opacity-50"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-sm font-medium truncate ${
                                    doc.expired ? 'text-red-700 line-through' : 'text-gray-900'
                                  }`}
                                >
                                  {doc.nombre}
                                </span>
                                <span
                                  className={`inline-flex px-1.5 py-0.5 rounded text-xs ${TIPO_COLORS[doc.tipo]}`}
                                >
                                  {TIPO_LABELS[doc.tipo]}
                                </span>
                                {doc.expired && (
                                  <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                                    <FileWarning size={11} />
                                    Vencido — bloquea generación
                                  </span>
                                )}
                                {!doc.expired && expiring && (
                                  <span className="inline-flex items-center gap-0.5 text-xs text-yellow-600">
                                    <AlertTriangle size={11} />
                                    Vence {formatDate(doc.fecha_vencimiento)}
                                  </span>
                                )}
                              </div>
                              {!doc.expired && doc.fecha_vencimiento && (
                                <div className="text-xs text-gray-500">
                                  Vence: {formatDate(doc.fecha_vencimiento)}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Los CVs de los consultores seleccionados se incluyen automáticamente.{' '}
                      <a
                        href="/admin/licitaciones/documentos-propuesta"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
                      >
                        Gestionar biblioteca <ExternalLink size={10} />
                      </a>
                    </p>
                  </div>
                )}
              </div>

              {/* ── GENERATE BUTTON ── */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={
                      generating ||
                      !plantillaId ||
                      !fichaId ||
                      (validationResult !== null && !validationResult.valid)
                    }
                    className="flex items-center gap-2 px-6 py-3 bg-yellow-400 text-black rounded-lg font-semibold hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Generando...
                      </>
                    ) : (
                      'Generar Propuesta Final'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    disabled={!previewConfig}
                    className="flex items-center gap-2 px-5 py-3 border border-yellow-400 text-yellow-700 rounded-lg font-medium hover:bg-yellow-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Muestra el cuerpo de la propuesta en el navegador (sin documentos adjuntos)"
                  >
                    {showPreview ? 'Ocultar Vista Previa' : 'Vista Previa (solo cuerpo)'}
                  </button>
                  {!plantillaId && (
                    <p className="text-xs text-gray-500">Seleccione una plantilla para continuar</p>
                  )}
                  {plantillaId && !fichaId && (
                    <p className="text-xs text-gray-500">Seleccione una ficha de servicio</p>
                  )}
                  {validationResult && !validationResult.valid && (
                    <p className="text-xs text-red-600">
                      {validationResult.errors.length} error
                      {validationResult.errors.length !== 1 ? 'es' : ''} de validación MINEDUC
                    </p>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  La generación puede tomar hasta 60 segundos. No cierre la página.
                </p>

                {/* ── PDF PREVIEW (body only) ── */}
                {showPreview && previewConfig && (
                  <ProposalPreview config={previewConfig} />
                )}
              </div>

              {/* ── POST-GENERATION SUCCESS PANEL ── */}
              {lastGenResult && (
                <div className="bg-[#0a0a0a] rounded-lg p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                      <CheckCircle size={18} className="text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-sm">Propuesta Web Generada</h3>
                      <p className="text-white/50 text-xs">Comparta el enlace y código de acceso con el cliente</p>
                    </div>
                  </div>

                  {/* Access Code */}
                  <div>
                    <label className="block text-xs font-medium text-[#fbbf24] mb-1.5">Código de Acceso</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-[#fbbf24] font-mono text-lg tracking-widest">
                        {lastGenResult.access_code}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(lastGenResult.access_code, 'Código')}
                        className="p-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white transition-colors"
                        title="Copiar código"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Web Link */}
                  <div>
                    <label className="block text-xs font-medium text-[#fbbf24] mb-1.5">Enlace Web</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white/80 font-mono text-sm truncate">
                        {typeof window !== 'undefined'
                          ? `${window.location.origin}/propuesta/${lastGenResult.web_slug}`
                          : `/propuesta/${lastGenResult.web_slug}`}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            `${window.location.origin}/propuesta/${lastGenResult.web_slug}`,
                            'Enlace'
                          )
                        }
                        className="p-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white transition-colors"
                        title="Copiar enlace"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-3 pt-2">
                    <a
                      href={`/propuesta/${lastGenResult.web_slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-[#fbbf24] text-[#0a0a0a] rounded-lg text-sm font-semibold hover:bg-[#f59e0b] transition-colors"
                    >
                      <Globe size={14} />
                      Ver Propuesta Web
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}/propuesta/${lastGenResult.web_slug}`;
                        const text = `Link: ${url}\nCódigo: ${lastGenResult.access_code}`;
                        copyToClipboard(text, 'Link + Código');
                      }}
                      className="flex items-center gap-2 px-4 py-2 border border-[#fbbf24]/50 text-[#fbbf24] rounded-lg text-sm font-medium hover:bg-white/5 transition-colors"
                    >
                      <Copy size={14} />
                      Copiar Link + Código
                    </button>
                  </div>
                </div>
              )}

              {/* ── HISTORIAL ── */}
              <div>
                <SectionHeader
                  title={`Historial de Propuestas (${propuestas.length})`}
                  open={secHistorial}
                  onToggle={() => setSecHistorial(o => !o)}
                />
                {secHistorial && (
                  <div>
                    {propuestas.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No hay propuestas generadas aún para esta licitación.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {propuestas.map(p => (
                          <div
                            key={p.id}
                            className={`p-3 rounded-lg border text-sm ${
                              p.estado === 'completada'
                                ? 'border-green-200 bg-green-50'
                                : p.estado === 'error'
                                ? 'border-red-200 bg-red-50'
                                : 'border-gray-200 bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="font-medium text-gray-800">
                                  v{p.version}
                                </span>
                                <span className="text-gray-500">
                                  {formatDateTime(p.created_at)}
                                </span>
                                <span
                                  className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                                    p.estado === 'completada'
                                      ? 'bg-green-100 text-green-700'
                                      : p.estado === 'error'
                                      ? 'bg-red-100 text-red-700'
                                      : p.estado === 'generando'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {p.estado}
                                </span>
                                {p.web_status && (
                                  <span
                                    className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                                      WEB_STATUS_STYLES[p.web_status] || 'bg-gray-100 text-gray-600'
                                    }`}
                                  >
                                    {WEB_STATUS_LABELS[p.web_status] || p.web_status}
                                  </span>
                                )}
                                {p.view_count != null && p.view_count > 0 && (
                                  <span className="flex items-center gap-1 text-xs text-gray-500">
                                    <Eye size={11} />
                                    {p.view_count} vista{p.view_count !== 1 ? 's' : ''}
                                    {p.viewed_at && (
                                      <span className="text-gray-400">
                                        &middot; {formatDateTime(p.viewed_at)}
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {p.estado === 'completada' && p.web_slug && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      copyToClipboard(
                                        `${window.location.origin}/propuesta/${p.web_slug}`,
                                        'Enlace'
                                      )
                                    }
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                                    title="Copiar enlace web"
                                  >
                                    <Copy size={12} />
                                    Link
                                  </button>
                                )}
                                {p.estado === 'completada' && (
                                  <button
                                    type="button"
                                    disabled
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-200 text-gray-400 rounded-lg text-xs font-medium cursor-not-allowed"
                                    title="Próximamente"
                                  >
                                    Regenerar Código
                                  </button>
                                )}
                                {p.estado === 'completada' && p.download_url && (
                                  <a
                                    href={p.download_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-green-300 text-green-700 rounded-lg text-xs font-medium hover:bg-green-50 transition-colors"
                                  >
                                    <Download size={13} />
                                    PDF
                                  </a>
                                )}
                              </div>
                            </div>
                            {p.estado === 'error' && p.error_message && (
                              <p className="text-xs text-red-600 mt-1.5">
                                {p.error_message}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// VALIDATION ROW SUB-COMPONENT
// ============================================================

function ValidationRow({
  pass,
  label,
  detail,
}: {
  pass: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {pass ? (
        <CheckCircle size={13} className="text-green-600 mt-0.5 flex-shrink-0" />
      ) : (
        <XCircle size={13} className="text-red-600 mt-0.5 flex-shrink-0" />
      )}
      <div>
        <span className={`font-medium ${pass ? 'text-green-800' : 'text-red-800'}`}>
          {label}:
        </span>{' '}
        <span className={pass ? 'text-green-700' : 'text-red-700'}>{detail}</span>
      </div>
    </div>
  );
}
