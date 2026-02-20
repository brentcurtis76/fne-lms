/**
 * Evaluacion de Propuestas — Step 5
 * /pages/licitaciones/[id]/evaluacion.tsx
 *
 * Dynamic evaluation form where committee members score ATEs on technical
 * criteria and enter proposed prices. Shows a live ranking panel.
 *
 * Access: admin (any licitacion) | encargado_licitacion (own school only)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Save, FileText, Upload, Check, AlertTriangle } from 'lucide-react';
import {
  LicitacionDetail,
  LicitacionAte,
  EvaluacionCriterio,
  EvaluationScore,
  ESTADO_DISPLAY,
  LicitacionEstado,
} from '@/types/licitaciones';
import { validateRut, formatRut } from '@/utils/rutValidation';
import {
  calculateEconomicScores,
  calculateWeightedScores,
  rankATEs,
} from '@/lib/evaluacionService';

// ============================================================
// SHARED STYLES
// ============================================================

const INPUT_CLASS =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:outline-none w-full';
const BTN_PRIMARY =
  'px-4 py-2 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed';
const BTN_SECONDARY =
  'px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-60';

// ============================================================
// TYPES
// ============================================================

interface CommitteeForm {
  nombre: string;
  rut: string;
  cargo: string;
}

interface AteScore {
  [criterioId: string]: { puntaje: string; comentario: string };
}

interface AteMontos {
  [ateId: string]: string; // raw string for input
}

interface CommitteeErrors {
  [idx: number]: { nombre?: string; rut?: string };
}

interface LiveRankRow {
  id: string;
  nombre_ate: string;
  puntaje_tecnico: number;
  puntaje_economico: number;
  puntaje_tecnico_ponderado: number;
  puntaje_economico_ponderado: number;
  puntaje_total: number;
  rank: number;
  es_ganador: boolean;
}

// ============================================================
// STATUS BADGE
// ============================================================

function EstadoBadge({ estado }: { estado: LicitacionEstado }) {
  const info = ESTADO_DISPLAY[estado] || {
    label: estado,
    color: 'text-gray-700',
    bg: 'bg-gray-100',
  };
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${info.bg} ${info.color}`}
    >
      {info.label}
    </span>
  );
}

// ============================================================
// RANKING PANEL
// ============================================================

function RankingPanel({
  rows,
  pesoTecnico,
  pesoEconomico,
}: {
  rows: LiveRankRow[];
  pesoTecnico: number;
  pesoEconomico: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500 text-center">
        Ingrese puntajes y montos para ver el ranking
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <p className="text-xs font-semibold text-gray-600">
          Ponderacion: Tecnica {pesoTecnico}% / Economica {pesoEconomico}%
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-2 text-left font-medium text-gray-600">ATE</th>
              <th className="px-2 py-2 text-right font-medium text-gray-600">Tec.</th>
              <th className="px-2 py-2 text-right font-medium text-gray-600">Eco.</th>
              <th className="px-2 py-2 text-right font-medium text-gray-600">T.Pond.</th>
              <th className="px-2 py-2 text-right font-medium text-gray-600">E.Pond.</th>
              <th className="px-2 py-2 text-right font-medium text-gray-600 font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.id}
                className={`border-b border-gray-100 ${row.es_ganador ? 'bg-yellow-50' : ''}`}
              >
                <td className="px-2 py-2 max-w-24 truncate">
                  {row.es_ganador && (
                    <span className="mr-1 text-yellow-500">★</span>
                  )}
                  <span className={row.es_ganador ? 'font-semibold' : ''}>{row.nombre_ate}</span>
                </td>
                <td className="px-2 py-2 text-right">{row.puntaje_tecnico}</td>
                <td className="px-2 py-2 text-right">{row.puntaje_economico}</td>
                <td className="px-2 py-2 text-right">{row.puntaje_tecnico_ponderado}</td>
                <td className="px-2 py-2 text-right">{row.puntaje_economico_ponderado}</td>
                <td className={`px-2 py-2 text-right font-bold ${row.es_ganador ? 'text-green-700' : ''}`}>
                  {row.puntaje_total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function EvaluacionPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { id } = router.query;

  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [authReady, setAuthReady] = useState(false);

  const [licitacion, setLicitacion] = useState<LicitacionDetail | null>(null);
  const [ates, setAtes] = useState<LicitacionAte[]>([]);
  const [criterios, setCriterios] = useState<EvaluacionCriterio[]>([]);
  const [loading, setLoading] = useState(true);

  // Committee state
  const [committee, setCommittee] = useState<CommitteeForm[]>([
    { nombre: '', rut: '', cargo: '' },
    { nombre: '', rut: '', cargo: '' },
    { nombre: '', rut: '', cargo: '' },
  ]);
  const [committeeErrors, setCommitteeErrors] = useState<CommitteeErrors>({});

  // Meeting metadata
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [fechaEvaluacion, setFechaEvaluacion] = useState(
    new Date().toISOString().split('T')[0]
  );

  // Scores state: ateId -> AteScore
  const [scores, setScores] = useState<Record<string, AteScore>>({});
  // Montos state: ateId -> string
  const [montos, setMontos] = useState<AteMontos>({});

  // Active ATE tab
  const [activeAteId, setActiveAteId] = useState<string>('');

  // Action states
  const [saving, setSaving] = useState(false);
  const [generatingActa, setGeneratingActa] = useState(false);
  const [uploadingActa, setUploadingActa] = useState(false);
  const [actaUrl, setActaUrl] = useState<string | null>(null);
  const [actaSigned, setActaSigned] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ============================================================
  // Auth
  // ============================================================

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (authReady && id && typeof id === 'string') {
      loadData(id);
    }
  }, [authReady, id]);

  const checkAuth = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/auth/my-roles');
      const rolesData = await response.json();
      const roles: string[] = (
        rolesData.roles ||
        rolesData.data?.roles ||
        []
      ).map((r: { role_type: string }) => r.role_type);

      const adminAccess = roles.includes('admin');
      const encargadoAccess = roles.includes('encargado_licitacion');

      if (!adminAccess && !encargadoAccess) {
        toast.error('No tiene permisos para acceder a evaluaciones');
        router.push('/dashboard');
        return;
      }

      setCurrentUser(user);
      setIsAdmin(adminAccess);
      setUserRole(adminAccess ? 'admin' : 'encargado_licitacion');
      setAuthReady(true);
    } catch {
      router.push('/login');
    }
  };

  // ============================================================
  // Data loading
  // ============================================================

  const loadData = useCallback(
    async (licitacionId: string) => {
      setLoading(true);
      try {
        // Fetch licitacion detail
        const licRes = await fetch(`/api/licitaciones/${licitacionId}`);
        const licJson = await licRes.json();

        if (!licRes.ok) {
          toast.error(licJson.error || 'Error al cargar licitacion');
          router.push(`/licitaciones/${licitacionId}`);
          return;
        }

        const lic: LicitacionDetail = licJson.data.licitacion;
        setLicitacion(lic);

        // Fetch evaluation data (committee, scores, ATEs, criterios)
        const evalRes = await fetch(`/api/licitaciones/${licitacionId}/evaluacion`);
        const evalJson = await evalRes.json();

        if (evalRes.ok) {
          const evalData = evalJson.data;

          // Set criterios
          const fetchedCriterios: EvaluacionCriterio[] = evalData.criterios || [];
          setCriterios(fetchedCriterios);

          // Set ATEs (with proposals only)
          const fetchedAtes: LicitacionAte[] = evalData.ates || [];
          setAtes(fetchedAtes);
          if (fetchedAtes.length > 0) {
            setActiveAteId(prev => prev || fetchedAtes[0].id);
          }

          // Set committee from DB
          const dbCommittee = evalData.committee || [];
          if (dbCommittee.length > 0) {
            const filled: CommitteeForm[] = [
              { nombre: '', rut: '', cargo: '' },
              { nombre: '', rut: '', cargo: '' },
              { nombre: '', rut: '', cargo: '' },
            ];
            for (const m of dbCommittee) {
              const idx = Number(m.orden) - 1;
              if (idx >= 0 && idx < 3) {
                filled[idx] = {
                  nombre: m.nombre || '',
                  rut: m.rut || '',
                  cargo: m.cargo || '',
                };
              }
            }
            setCommittee(filled);
          }

          // Set evaluation hours from licitacion
          if (lic.hora_inicio_evaluacion) setHoraInicio(lic.hora_inicio_evaluacion);
          if (lic.hora_fin_evaluacion) setHoraFin(lic.hora_fin_evaluacion);

          // Populate scores from DB
          const dbScores = evalData.scores || [];
          const scoresMap: Record<string, AteScore> = {};
          for (const s of dbScores) {
            if (!scoresMap[s.ate_id]) scoresMap[s.ate_id] = {};
            scoresMap[s.ate_id][s.criterio_id] = {
              puntaje: String(s.puntaje),
              comentario: s.comentario || '',
            };
          }
          setScores(scoresMap);

          // Populate montos from ATEs
          const montosMap: AteMontos = {};
          for (const ate of fetchedAtes) {
            if (ate.monto_propuesto) {
              montosMap[ate.id] = String(ate.monto_propuesto);
            }
          }
          setMontos(montosMap);
        }
      } catch {
        toast.error('Error al cargar datos de evaluacion');
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  // ============================================================
  // Live ranking calculation
  // ============================================================

  const computeLiveRanking = useCallback((): LiveRankRow[] => {
    if (!licitacion || ates.length === 0) return [];

    const atesWithMontos = ates
      .map(ate => {
        const monto = parseFloat(montos[ate.id] || '0');
        return { id: ate.id, monto_propuesto: monto };
      })
      .filter(a => a.monto_propuesto > 0);

    if (atesWithMontos.length === 0) return [];

    let economicScores: Array<{ id: string; puntaje_economico: number }> = [];
    try {
      economicScores = calculateEconomicScores(atesWithMontos);
    } catch {
      return [];
    }

    const rows = atesWithMontos.map(a => {
      const ate = ates.find(at => at.id === a.id);
      if (!ate) return null;

      // Sum technical scores for this ATE
      const ateScores = scores[a.id] || {};
      const techTotal = criterios.reduce((sum, c) => {
        const val = parseFloat(ateScores[c.id]?.puntaje || '0');
        return sum + (isNaN(val) ? 0 : val);
      }, 0);

      const ecoScore =
        economicScores.find(e => e.id === a.id)?.puntaje_economico || 0;

      const weighted = calculateWeightedScores(
        techTotal,
        ecoScore,
        licitacion.peso_evaluacion_tecnica,
        licitacion.peso_evaluacion_economica
      );

      return {
        id: a.id,
        nombre_ate: ate.nombre_ate,
        puntaje_tecnico: Math.round(techTotal * 10) / 10,
        puntaje_economico: ecoScore,
        ...weighted,
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    const ranked = rankATEs(rows.map(r => ({ id: r.id, puntaje_total: r.puntaje_total })));

    return rows.map(r => {
      const rankInfo = ranked.find(rk => rk.id === r.id);
      return {
        ...r,
        rank: rankInfo?.rank || 0,
        es_ganador: rankInfo?.es_ganador || false,
      };
    }).sort((a, b) => a.rank - b.rank);
  }, [ates, scores, montos, criterios, licitacion]);

  const liveRanking = computeLiveRanking();

  // ============================================================
  // Validation
  // ============================================================

  const validateCommittee = (): boolean => {
    const errors: CommitteeErrors = {};
    for (let i = 0; i < committee.length; i++) {
      const m = committee[i];
      const errs: CommitteeErrors[number] = {};
      if (!m.nombre.trim()) {
        errs.nombre = 'Nombre requerido';
      }
      if (m.rut && !validateRut(m.rut)) {
        errs.rut = 'RUT invalido';
      }
      if (Object.keys(errs).length > 0) errors[i] = errs;
    }
    setCommitteeErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const canGenerateActa = (): boolean => {
    // At least 3 members with nombres filled
    const filled = committee.filter(m => m.nombre.trim());
    if (filled.length < 3) return false;

    // At least 1 ATE with all criteria scored and monto
    return ates.some(ate => {
      const monto = parseFloat(montos[ate.id] || '0');
      if (monto <= 0) return false;
      return criterios.every(c => {
        const val = parseFloat(scores[ate.id]?.[c.id]?.puntaje || '');
        return !isNaN(val) && val >= 0;
      });
    });
  };

  // ============================================================
  // Save evaluation
  // ============================================================

  const handleSave = async () => {
    if (!id || typeof id !== 'string') return;

    setSaving(true);
    try {
      // Build committee
      const committeeData = committee.map((m, idx) => ({
        nombre: m.nombre.trim(),
        rut: m.rut ? formatRut(m.rut) : null,
        cargo: m.cargo.trim() || null,
        orden: idx + 1,
      })).filter(m => m.nombre);

      // Build scores array
      const scoresArr: EvaluationScore[] = [];
      for (const [ateId, ateScores] of Object.entries(scores)) {
        for (const [criterioId, sc] of Object.entries(ateScores)) {
          const puntaje = parseFloat(sc.puntaje);
          if (!isNaN(puntaje)) {
            scoresArr.push({
              ate_id: ateId,
              criterio_id: criterioId,
              puntaje,
              comentario: sc.comentario || null,
            });
          }
        }
      }

      // Build montos array
      const montosArr = Object.entries(montos)
        .map(([ateId, montoStr]) => ({
          ate_id: ateId,
          monto_propuesto: parseFloat(montoStr) || 0,
        }))
        .filter(m => m.monto_propuesto > 0);

      const body = {
        committee: committeeData,
        hora_inicio: horaInicio || null,
        hora_fin: horaFin || null,
        fecha_evaluacion: fechaEvaluacion || null,
        scores: scoresArr,
        montos: montosArr,
      };

      const res = await fetch(`/api/licitaciones/${id}/evaluacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al guardar evaluacion');
        return;
      }

      toast.success('Evaluacion guardada exitosamente');
    } catch {
      toast.error('Error al guardar evaluacion');
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // Generate Acta
  // ============================================================

  const handleGenerateActa = async () => {
    if (!id || typeof id !== 'string') return;

    if (!validateCommittee()) {
      toast.error('Corrija los errores en la Comision Evaluadora antes de generar el Acta');
      return;
    }

    setGeneratingActa(true);
    try {
      // Auto-save first
      await handleSave();

      const res = await fetch(`/api/licitaciones/${id}/generate-acta`);
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Error al generar el Acta');
        return;
      }

      setActaUrl(json.data.url);
      toast.success('Acta de Reunion generada exitosamente');

      if (json.data.url) {
        window.open(json.data.url, '_blank');
      }
    } catch {
      toast.error('Error al generar el Acta');
    } finally {
      setGeneratingActa(false);
    }
  };

  // ============================================================
  // Upload signed Acta
  // ============================================================

  const handleUploadActa = async (file: File) => {
    if (!id || typeof id !== 'string') return;

    if (
      !window.confirm(
        'ATENCION: Esta accion es irreversible.\n\nAl confirmar:\n- El Acta firmada quedara registrada\n- El proceso avanzara a "Adjudicacion Pendiente"\n- No sera posible volver a la etapa de Evaluacion\n\n¿Confirmar?'
      )
    ) {
      return;
    }

    setUploadingActa(true);
    try {
      // Upload the file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipo', 'evaluacion_firmada');
      formData.append('nombre', `Acta firmada — ${licitacion?.numero_licitacion}`);

      const uploadRes = await fetch(`/api/licitaciones/${id}/upload`, {
        method: 'POST',
        body: formData,
      });

      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) {
        toast.error(uploadJson.error || 'Error al subir el Acta');
        return;
      }

      setActaSigned(true);
      toast.success('Acta firmada subida. Avanzando estado...');

      // Advance state
      setAdvancing(true);
      const advanceRes = await fetch(`/api/licitaciones/${id}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_estado: 'adjudicacion_pendiente' }),
      });

      const advanceJson = await advanceRes.json();
      if (!advanceRes.ok) {
        toast.error(advanceJson.error || 'Error al avanzar estado');
        return;
      }

      toast.success('Estado avanzado a Adjudicacion Pendiente');
      router.push(`/licitaciones/${id}`);
    } catch {
      toast.error('Error al procesar el Acta firmada');
    } finally {
      setUploadingActa(false);
      setAdvancing(false);
    }
  };

  // ============================================================
  // Render
  // ============================================================

  if (loading || !licitacion) {
    return (
      <MainLayout
        user={currentUser as Parameters<typeof MainLayout>[0]['user']}
        currentPage="licitaciones"
        pageTitle="Evaluacion"
        isAdmin={isAdmin}
        userRole={userRole}
      >
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
        </div>
      </MainLayout>
    );
  }

  const isEditable = licitacion.estado === 'evaluacion_pendiente';
  const canAdvance = isEditable && actaSigned;

  return (
    <MainLayout
      user={currentUser as Parameters<typeof MainLayout>[0]['user']}
      currentPage="licitaciones"
      pageTitle="Evaluacion de Propuestas"
      isAdmin={isAdmin}
      userRole={userRole}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <button
          onClick={() => router.push(`/licitaciones/${id}`)}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft size={18} className="mr-1" />
          Volver a Licitacion
        </button>

        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-sm text-gray-500 mb-1">{licitacion.numero_licitacion}</p>
            <h1 className="text-2xl font-bold text-gray-900">Evaluacion de Propuestas</h1>
            <p className="text-sm text-gray-600 mt-1">{licitacion.nombre_licitacion}</p>
          </div>
          <EstadoBadge estado={licitacion.estado} />
        </div>

        {/* Read-only notice if not in editable state */}
        {!isEditable && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6 text-sm text-blue-800 flex items-center gap-2">
            <AlertTriangle size={16} className="flex-shrink-0" />
            <span>
              {licitacion.estado === 'adjudicacion_pendiente' || ['contrato_pendiente', 'contrato_generado', 'adjudicada_externo', 'cerrada'].includes(licitacion.estado)
                ? 'La evaluacion esta completa. Esta vista es de solo lectura.'
                : 'Este paso no esta disponible en el estado actual.'}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Main form area */}
          <div className="xl:col-span-2 space-y-6">
            {/* Committee Section */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Comision Evaluadora</h2>
              <div className="space-y-4">
                {committee.map((member, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-500 mb-3">
                      Miembro {idx + 1}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label htmlFor={`cm-nombre-${idx}`} className="block text-xs font-medium text-gray-600 mb-1">
                          Nombre <span className="text-red-500">*</span>
                        </label>
                        <input
                          id={`cm-nombre-${idx}`}
                          type="text"
                          value={member.nombre}
                          disabled={!isEditable}
                          onChange={e =>
                            setCommittee(c =>
                              c.map((m, i) => (i === idx ? { ...m, nombre: e.target.value } : m))
                            )
                          }
                          className={INPUT_CLASS}
                          placeholder="Nombre completo"
                        />
                        {committeeErrors[idx]?.nombre && (
                          <p className="text-xs text-red-600 mt-1">{committeeErrors[idx].nombre}</p>
                        )}
                      </div>
                      <div>
                        <label htmlFor={`cm-rut-${idx}`} className="block text-xs font-medium text-gray-600 mb-1">
                          RUT
                        </label>
                        <input
                          id={`cm-rut-${idx}`}
                          type="text"
                          value={member.rut}
                          disabled={!isEditable}
                          onChange={e =>
                            setCommittee(c =>
                              c.map((m, i) => (i === idx ? { ...m, rut: e.target.value } : m))
                            )
                          }
                          className={INPUT_CLASS}
                          placeholder="12.345.678-9"
                        />
                        {committeeErrors[idx]?.rut && (
                          <p className="text-xs text-red-600 mt-1">{committeeErrors[idx].rut}</p>
                        )}
                      </div>
                      <div>
                        <label htmlFor={`cm-cargo-${idx}`} className="block text-xs font-medium text-gray-600 mb-1">
                          Cargo
                        </label>
                        <input
                          id={`cm-cargo-${idx}`}
                          type="text"
                          value={member.cargo}
                          disabled={!isEditable}
                          onChange={e =>
                            setCommittee(c =>
                              c.map((m, i) => (i === idx ? { ...m, cargo: e.target.value } : m))
                            )
                          }
                          className={INPUT_CLASS}
                          placeholder="Director / Jefe UTP"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Meeting Metadata */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Datos de la Reunion</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="fecha-evaluacion" className="block text-xs font-medium text-gray-600 mb-1">
                    Fecha de evaluacion
                  </label>
                  <input
                    id="fecha-evaluacion"
                    type="date"
                    value={fechaEvaluacion}
                    disabled={!isEditable}
                    onChange={e => setFechaEvaluacion(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="hora-inicio" className="block text-xs font-medium text-gray-600 mb-1">
                    Hora inicio (HH:MM)
                  </label>
                  <input
                    id="hora-inicio"
                    type="time"
                    value={horaInicio}
                    disabled={!isEditable}
                    onChange={e => setHoraInicio(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="hora-fin" className="block text-xs font-medium text-gray-600 mb-1">
                    Hora fin (HH:MM)
                  </label>
                  <input
                    id="hora-fin"
                    type="time"
                    value={horaFin}
                    disabled={!isEditable}
                    onChange={e => setHoraFin(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
            </div>

            {/* Per-ATE Scoring */}
            {ates.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center text-sm text-amber-800">
                No hay ATEs con propuestas registradas para evaluar.
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Puntajes por ATE</h2>
                </div>

                {/* ATE Tabs */}
                <div role="tablist" aria-label="Empresas ATE para evaluar" className="flex border-b border-gray-200 overflow-x-auto">
                  {ates.map(ate => (
                    <button
                      key={ate.id}
                      role="tab"
                      id={`tab-${ate.id}`}
                      aria-selected={activeAteId === ate.id}
                      aria-controls={`panel-${ate.id}`}
                      onClick={() => setActiveAteId(ate.id)}
                      className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                        activeAteId === ate.id
                          ? 'border-yellow-400 text-yellow-700 bg-yellow-50'
                          : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                      }`}
                    >
                      {ate.nombre_ate}
                    </button>
                  ))}
                </div>

                {/* Active ATE scoring form */}
                {ates.map(ate => (
                  <div
                    key={ate.id}
                    role="tabpanel"
                    id={`panel-${ate.id}`}
                    aria-labelledby={`tab-${ate.id}`}
                    className={`p-6 ${activeAteId !== ate.id ? 'hidden' : ''}`}
                  >
                    {/* Technical Criteria */}
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                      A. Evaluacion Tecnica
                    </h3>
                    <div className="space-y-3 mb-6">
                      {criterios.map(criterio => {
                        const ateScore = scores[ate.id]?.[criterio.id] || {
                          puntaje: '',
                          comentario: '',
                        };
                        const puntajeNum = parseFloat(ateScore.puntaje);
                        const isOver = !isNaN(puntajeNum) && puntajeNum > criterio.puntaje_maximo;

                        return (
                          <div
                            key={criterio.id}
                            className="bg-gray-50 rounded-lg p-4"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="text-sm font-medium text-gray-800">
                                  {criterio.nombre_criterio}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Maximo: {criterio.puntaje_maximo} pts
                                </p>
                              </div>
                              <div className="w-24">
                                <label htmlFor={`score-${ate.id}-${criterio.id}`} className="sr-only">
                                  {criterio.nombre_criterio} — Puntaje (maximo: {criterio.puntaje_maximo})
                                </label>
                                <input
                                  id={`score-${ate.id}-${criterio.id}`}
                                  type="number"
                                  min={0}
                                  max={criterio.puntaje_maximo}
                                  step={1}
                                  value={ateScore.puntaje}
                                  disabled={!isEditable}
                                  onChange={e =>
                                    setScores(prev => ({
                                      ...prev,
                                      [ate.id]: {
                                        ...(prev[ate.id] || {}),
                                        [criterio.id]: {
                                          ...(prev[ate.id]?.[criterio.id] || { comentario: '' }),
                                          puntaje: e.target.value,
                                        },
                                      },
                                    }))
                                  }
                                  className={`border rounded px-2 py-2 text-sm text-right w-full focus:ring-2 focus:ring-yellow-400 focus:outline-none ${
                                    isOver ? 'border-red-400' : 'border-gray-300'
                                  }`}
                                  placeholder="0"
                                />
                                {isOver && (
                                  <p className="text-xs text-red-600 mt-1">
                                    Max: {criterio.puntaje_maximo}
                                  </p>
                                )}
                              </div>
                            </div>
                            <label htmlFor={`comment-${ate.id}-${criterio.id}`} className="sr-only">
                              Comentario para {criterio.nombre_criterio} (opcional)
                            </label>
                            <textarea
                              id={`comment-${ate.id}-${criterio.id}`}
                              value={ateScore.comentario}
                              disabled={!isEditable}
                              onChange={e =>
                                setScores(prev => ({
                                  ...prev,
                                  [ate.id]: {
                                    ...(prev[ate.id] || {}),
                                    [criterio.id]: {
                                      ...(prev[ate.id]?.[criterio.id] || { puntaje: '' }),
                                      comentario: e.target.value,
                                    },
                                  },
                                }))
                              }
                              placeholder="Comentario (opcional)"
                              rows={2}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-600 resize-none focus:ring-1 focus:ring-yellow-400 focus:outline-none"
                            />
                          </div>
                        );
                      })}

                      {/* Technical subtotal */}
                      <div className="bg-blue-50 rounded-lg px-4 py-2 text-sm font-medium text-blue-800">
                        Puntaje Tecnico:{' '}
                        {criterios.reduce((sum, c) => {
                          const val = parseFloat(scores[ate.id]?.[c.id]?.puntaje || '0');
                          return sum + (isNaN(val) ? 0 : val);
                        }, 0).toFixed(1)}{' '}
                        / 100
                      </div>
                    </div>

                    {/* Economic Evaluation */}
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                      B. Evaluacion Economica
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-end gap-4">
                        <div className="flex-1">
                          <label
                            htmlFor={`monto-${ate.id}`}
                            className="block text-xs font-medium text-gray-600 mb-1"
                          >
                            Monto propuesto (CLP)
                          </label>
                          <input
                            id={`monto-${ate.id}`}
                            type="number"
                            min={1}
                            step={1000}
                            value={montos[ate.id] || ''}
                            disabled={!isEditable}
                            onChange={e =>
                              setMontos(prev => ({
                                ...prev,
                                [ate.id]: e.target.value,
                              }))
                            }
                            className={INPUT_CLASS}
                            placeholder="15000000"
                          />
                        </div>
                        <div className="w-40 bg-white rounded-lg border border-gray-200 px-3 py-2 text-center">
                          <p className="text-xs text-gray-500 mb-1">Puntaje Economico</p>
                          <p className="text-lg font-bold text-blue-700">
                            {(() => {
                              const row = liveRanking.find(r => r.id === ate.id);
                              return row ? row.puntaje_economico : '-';
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            {isEditable && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Acciones</h2>
                <div className="flex flex-wrap gap-3">
                  {/* Save */}
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className={BTN_PRIMARY}
                  >
                    <span className="flex items-center gap-2">
                      <Save size={16} />
                      {saving ? 'Guardando...' : 'Guardar Evaluacion'}
                    </span>
                  </button>

                  {/* Generate Acta */}
                  <button
                    onClick={handleGenerateActa}
                    disabled={generatingActa || !canGenerateActa()}
                    className={BTN_SECONDARY}
                    title={
                      !canGenerateActa()
                        ? 'Complete la comision y los puntajes de al menos 1 ATE para generar el Acta'
                        : undefined
                    }
                  >
                    <span className="flex items-center gap-2">
                      <FileText size={16} />
                      {generatingActa ? 'Generando...' : 'Generar Acta de Reunion'}
                    </span>
                  </button>
                </div>

                {actaUrl && (
                  <div className="mt-3 text-sm text-green-700 flex items-center gap-1">
                    <Check size={14} />
                    <a href={actaUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      Acta generada — descargar
                    </a>
                  </div>
                )}

                {/* Upload signed Acta */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-800 mb-2">
                    Subir Acta Firmada
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Suba el Acta firmada por los miembros de la comision (PDF o imagen).
                    Esta accion avanzara el estado a &ldquo;Adjudicacion Pendiente&rdquo;.
                  </p>
                  {actaSigned ? (
                    <div className="flex items-center gap-2 text-green-700 text-sm">
                      <Check size={16} />
                      Acta firmada subida correctamente
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadActa(file);
                        }}
                        className="hidden"
                        id="acta-upload"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingActa || advancing}
                        className={BTN_PRIMARY}
                      >
                        <span className="flex items-center gap-2">
                          <Upload size={16} />
                          {uploadingActa || advancing
                            ? 'Procesando...'
                            : 'Subir Acta Firmada'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar — Live Ranking */}
          <div className="xl:col-span-1">
            <div className="sticky top-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                Ranking en Tiempo Real
              </h2>
              <RankingPanel
                rows={liveRanking}
                pesoTecnico={licitacion.peso_evaluacion_tecnica}
                pesoEconomico={licitacion.peso_evaluacion_economica}
              />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
