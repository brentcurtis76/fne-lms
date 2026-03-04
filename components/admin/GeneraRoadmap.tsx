import React, { useState, useCallback } from "react"

const CELL_W = 56
const LABEL_W = 380
const ROW_H = 40

const BRAND = {
  bg:       '#ffffff',
  bgCard:   '#f9fafb',
  bgHover:  '#f3f4f6',
  border:   '#e5e7eb',
  borderMid:'#d1d5db',
  yellow:   '#f59e0b',
  yellowHi: '#d97706',
  yellowLo: '#fcd34d',
  white:    '#0a0a0a',
  grayMid:  '#6b7280',
  grayDark: '#374151',
  textBody: '#374151',
  textMid:  '#9ca3af',
  textDim:  '#d1d5db',
}

const PHASE_COLORS = [
  '#f59e0b','#d97706','#eab308',
  '#3b82f6','#6366f1','#8b5cf6',
  '#10b981','#ef4444','#ec4899','#0ea5e9'
]

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RoadmapTask {
  id: string
  name: string
  s: number
  e: number
  hot: boolean
}

export interface RoadmapPhase {
  id: string
  label: string
  color: string
  tasks: RoadmapTask[]
}

export interface RoadmapFinding {
  id: string
  color: string
  text: string
}

export interface RoadmapData {
  title: string
  subtitle: string
  alert: string
  weeks: string[]
  phases: RoadmapPhase[]
  findings: RoadmapFinding[]
}

export interface GeneraRoadmapProps {
  initialData: RoadmapData
  onSave: (data: RoadmapData) => Promise<void>
}

// ─── Default data ─────────────────────────────────────────────────────────────

export const DEFAULT_DATA: RoadmapData = {
  title: "GENERA · MVP · 13 Semanas",
  subtitle: "4 Mar → 31 May 2026  ·  7 funcionalidades greenfield  ·  2 extensiones  ·  1 deadline inamovible",
  alert: "INICIAR HOY — Onboarding comercial Transbank: 4–6 semanas de burocracia (verificación RUT, acuerdos comerciales, acceso al ambiente de pruebas). Sin esto, el pago no estará listo en mayo. Construir Stripe como fallback en paralelo.",
  weeks: ['Mar 4','Mar 11','Mar 18','Mar 25','Apr 1','Apr 8','Apr 15','Apr 22','Apr 29','May 6','May 13','May 20','May 27'],
  phases: [
    { id:'p0', label:'FASE 0 · FUNDACIÓN', color:'#f59e0b', tasks:[
      {id:'t00',name:'Schema DB — todas las tablas nuevas de una vez',s:1,e:1,hot:true},
      {id:'t01',name:'Nuevos roles: asesor / estudiante / familia',s:1,e:1,hot:false},
      {id:'t02',name:'TypeScript strict + estándares de error API',s:1,e:2,hot:false},
    ]},
    { id:'p1', label:'FASE 1 · CAPA INDIVIDUAL', color:'#f59e0b', tasks:[
      {id:'t10',name:'Perfil estudiante + cómputo etapa de desarrollo',s:2,e:2,hot:false},
      {id:'t11',name:'Plan Personal: DB + API + categorías',s:2,e:3,hot:false},
      {id:'t12',name:'Plan Personal: UI (objetivos, reflexiones, progreso)',s:3,e:4,hot:false},
      {id:'t13',name:'Proyecto de Autoconocimiento (extender + standalone)',s:3,e:5,hot:false},
    ]},
    { id:'p2', label:'FASE 2 · CAPA ASESOR', color:'#fcd34d', tasks:[
      {id:'t20',name:'UI gestión Equipo Base',s:4,e:5,hot:false},
      {id:'t21',name:'Sesiones asesor — extender sistema existente',s:4,e:5,hot:false},
      {id:'t22',name:'Dashboard asesor — vista semáforo',s:5,e:6,hot:false},
      {id:'t23',name:'Protocolo de traspaso asesor',s:6,e:6,hot:false},
    ]},
    { id:'p3', label:'FASE 3 · GRUPO + CÍRCULO', color:'#3b82f6', tasks:[
      {id:'t30',name:'Círculo: interfaz facilitador estudiante',s:6,e:7,hot:false},
      {id:'t31',name:'Círculo: flujos pre/post + biblioteca de rituales',s:7,e:8,hot:false},
      {id:'t32',name:'Sociograma: capa de observación asesor',s:7,e:9,hot:false},
      {id:'t33',name:'Presentaciones familiares: prep + artefactos',s:8,e:9,hot:false},
    ]},
    { id:'p4', label:'FASE 4 · SEÑALES + CUMPLIMIENTO', color:'#8b5cf6', tasks:[
      {id:'t40',name:'Alertas tempranas: convergencia multi-indicador',s:9,e:10,hot:false},
      {id:'t41',name:'Consentimiento parental: flujo Clave Única',s:9,e:10,hot:false},
      {id:'t42',name:'Ley 21.719: cifrado app + registros consentimiento',s:10,e:11,hot:false},
    ]},
    { id:'p5', label:'FASE 5 · PAGOS', color:'#10b981', tasks:[
      {id:'t50',name:'Stripe B2C suscripción + webhooks',s:9,e:11,hot:false},
      {id:'t51',name:'UX suscripción familiar (consumer-grade)',s:10,e:11,hot:false},
      {id:'t52',name:'Transbank (si onboarding completado a tiempo)',s:11,e:12,hot:false},
    ]},
    { id:'p6', label:'FASE 6 · PRODUCCIÓN', color:'#ef4444', tasks:[
      {id:'t60',name:'Sprint QA + corrección de bugs',s:11,e:12,hot:false},
      {id:'t61',name:'Auditoría seguridad + verificación RLS',s:12,e:12,hot:false},
      {id:'t62',name:'Performance + pruebas de carga',s:12,e:13,hot:false},
      {id:'t63',name:'Lanzamiento a producción',s:13,e:13,hot:true},
    ]},
  ],
  findings: [
    {id:'f0',color:'#f59e0b',text:'Schema DB en S1 → previene reescritura de FK a mitad del sprint'},
    {id:'f1',color:'#d97706',text:'Capa individual primero → Equipo Base necesita estudiantes + planes como referencia'},
    {id:'f2',color:'#eab308',text:'Sesiones consultor existentes = 70% de sesiones asesor ya construidas → gran ventaja'},
    {id:'f3',color:'#3b82f6',text:'Sociograma después de sesiones → necesita datos de observación para poblar'},
    {id:'f4',color:'#8b5cf6',text:'Alertas al final → requiere convergencia de sociograma + datos del plan'},
    {id:'f5',color:'#10b981',text:'Stripe en paralelo con Fase 4 → desacoplado de funcionalidades pedagógicas'},
    {id:'f6',color:'#f59e0b',text:'Transbank comienza HOY — 4–6 semanas de trámites, no puede acelerarse'},
  ]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const gid = () => 'x' + Math.random().toString(36).slice(2, 8)

const iBase: React.CSSProperties = {
  background: '#ffffff',
  border: `1px solid ${BRAND.border}`,
  borderRadius: 4,
  color: BRAND.textBody,
  fontFamily: 'Inter, Helvetica Neue, Arial, system-ui, sans-serif',
  fontSize: 14,
  padding: '8px 12px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GridLine({ i, n }: { i: number; n: number }) {
  const isFirst = i === 0
  const isLast  = i === n - 1
  return (
    <div style={{
      position: 'absolute', left: i * CELL_W, top: 0, width: 1, height: '100%',
      background: isFirst ? `${BRAND.yellow}44` : isLast ? BRAND.grayMid : BRAND.border,
      pointerEvents: 'none',
    }}/>
  )
}

function Btn({ onClick, label, danger }: { onClick: () => void; label: string; danger?: boolean }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '0 4px', lineHeight: 1,
        color: hov ? (danger ? '#ef4444' : BRAND.grayDark) : BRAND.grayMid,
        fontSize: label === '×' ? 16 : 13,
        fontFamily: 'inherit', transition: 'color 0.1s',
      }}
    >
      {label}
    </button>
  )
}

interface TaskRowProps {
  task: RoadmapTask
  phase: RoadmapPhase
  totalWeeks: number
  editMode: boolean
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  chartW: number
}

function TaskRow({ task, phase, totalWeeks, editMode, isSelected, onSelect, onDelete, chartW }: TaskRowProps) {
  const [hov, setHov] = useState(false)
  const barLeft = (task.s - 1) * CELL_W + 2
  const barW    = (task.e - task.s + 1) * CELL_W - 4
  const active  = hov || isSelected

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', height: ROW_H, marginBottom: 1,
        background: active ? BRAND.bgHover : 'transparent',
        borderRadius: 2,
      }}
    >
      <div style={{
        width: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center',
        paddingLeft: 22, paddingRight: 8, gap: 4, overflow: 'hidden',
      }}>
        <span
          title={task.name}
          style={{
            flex: 1, fontSize: 14,
            color: task.hot ? BRAND.white : BRAND.grayDark,
            fontWeight: task.hot ? 600 : 400,
            lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
          }}
        >
          {task.name}
        </span>
        {editMode && hov && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <Btn onClick={onSelect} label="✎" />
            <Btn onClick={onDelete} label="×" danger />
          </div>
        )}
      </div>

      <div style={{ width: chartW, position: 'relative', height: '100%', flexShrink: 0 }}>
        {Array.from({ length: totalWeeks }, (_, i) =>
          <GridLine key={i} i={i} n={totalWeeks} />
        )}
        <div
          onClick={() => editMode && onSelect()}
          style={{
            position: 'absolute', left: barLeft, top: '50%',
            width: barW, height: task.hot ? 20 : 14,
            transform: 'translateY(-50%)',
            background: task.hot ? phase.color : `${phase.color}25`,
            border: `1px solid ${isSelected ? phase.color : task.hot ? phase.color : phase.color + '55'}`,
            borderRadius: 2,
            cursor: editMode ? 'pointer' : 'default',
            transition: 'all 0.1s',
          }}
        />
      </div>
    </div>
  )
}

interface EditPanelProps {
  selected: { type: 'task' | 'phase'; phaseId: string; taskId?: string }
  data: RoadmapData
  update: (fn: (d: RoadmapData) => RoadmapData) => void
  onClose: () => void
}

function EditPanel({ selected, data, update, onClose }: EditPanelProps) {
  const phase = data.phases.find(p => p.id === selected.phaseId)
  const task  = selected.type === 'task' && phase
    ? phase.tasks.find(t => t.id === selected.taskId)
    : null

  const setTask = (fn: (t: RoadmapTask) => RoadmapTask) =>
    update(d => ({ ...d, phases: d.phases.map(p =>
      p.id !== selected.phaseId ? p : { ...p, tasks: p.tasks.map(t =>
        t.id !== selected.taskId ? t : fn(t)
      )}
    )}))

  const setPhase = (fn: (p: RoadmapPhase) => RoadmapPhase) =>
    update(d => ({ ...d, phases: d.phases.map(p =>
      p.id !== selected.phaseId ? p : fn(p)
    )}))

  return (
    <div style={{
      width: 260, flexShrink: 0,
      background: BRAND.bgCard,
      borderLeft: `1px solid ${BRAND.border}`,
      overflowY: 'auto', padding: '20px 16px', boxShadow: '-2px 0 8px rgba(0,0,0,0.06)',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.2em',
          color: BRAND.textMid, textTransform: 'uppercase' }}>
          {selected.type === 'task' ? 'Editar Tarea' : 'Editar Fase'}
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: BRAND.textMid,
          cursor: 'pointer', fontSize: 18, lineHeight: 1, fontFamily: 'inherit',
        }}>×</button>
      </div>

      {selected.type === 'task' && task && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontSize: 12, color: BRAND.textMid, letterSpacing: '0.15em',
              textTransform: 'uppercase', fontWeight: 700 }}>Nombre</div>
            <textarea
              value={task.name}
              onChange={e => setTask(t => ({ ...t, name: e.target.value }))}
              style={{ ...iBase, minHeight: 68, resize: 'vertical', lineHeight: 1.6 } as React.CSSProperties}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {(['s', 'e'] as const).map(key => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: 12, color: BRAND.textMid, letterSpacing: '0.15em',
                  textTransform: 'uppercase', fontWeight: 700 }}>
                  {key === 's' ? 'Sem. inicio' : 'Sem. fin'}
                </div>
                <input
                  type="number"
                  min={key === 'e' ? task.s : 1}
                  max={data.weeks.length}
                  value={task[key]}
                  onChange={e => {
                    const v = Math.min(Math.max(key === 'e' ? task.s : 1, +e.target.value), data.weeks.length)
                    setTask(t => ({ ...t, [key]: v, ...(key === 's' ? { e: Math.max(v, t.e) } : {}) }))
                  }}
                  style={{ ...iBase, width: 58 }}
                />
              </div>
            ))}
          </div>

          <div style={{ fontSize: 13, color: BRAND.textMid, marginTop: -8 }}>
            {data.weeks[task.s - 1]} → {data.weeks[task.e - 1]}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!task.hot}
              onChange={e => setTask(t => ({ ...t, hot: e.target.checked }))}
            />
            <span style={{ fontSize: 14, color: BRAND.grayMid }}>Hito / milestone</span>
          </label>
        </>
      )}

      {selected.type === 'phase' && phase && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontSize: 12, color: BRAND.textMid, letterSpacing: '0.15em',
              textTransform: 'uppercase', fontWeight: 700 }}>Nombre</div>
            <input
              value={phase.label}
              onChange={e => setPhase(p => ({ ...p, label: e.target.value }))}
              style={iBase}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: BRAND.textMid, letterSpacing: '0.15em',
              textTransform: 'uppercase', fontWeight: 700 }}>Color</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PHASE_COLORS.map(c => (
                <div
                  key={c}
                  onClick={() => setPhase(p => ({ ...p, color: c }))}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', background: c,
                    cursor: 'pointer', boxSizing: 'border-box',
                    border: phase.color === c ? `2px solid ${BRAND.yellow}` : '2px solid transparent',
                    transition: 'border-color 0.1s',
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GeneraRoadmap({ initialData, onSave }: GeneraRoadmapProps) {
  const [data,   setData]   = useState<RoadmapData>(initialData)
  const [edit,   setEdit]   = useState(false)
  const [sel,    setSel]    = useState<{ type: 'task' | 'phase'; phaseId: string; taskId?: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  const persist = useCallback(async (d: RoadmapData) => {
    setSaving(true)
    try { await onSave(d) } catch {}
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [onSave])

  const update = useCallback((fn: (d: RoadmapData) => RoadmapData) => {
    setData(prev => { const n = fn(prev); persist(n); return n })
  }, [persist])

  const nW     = data.weeks.length
  const chartW = CELL_W * nW

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', overflow: 'hidden',
      background: BRAND.bg,
      fontFamily: 'Inter, Helvetica Neue, Arial, system-ui, sans-serif',
      color: BRAND.textBody,
    }}>

      {/* ── Row wrapper for scroll + edit panel ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── Scroll area ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '32px 28px 24px' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 24 }}>
          {edit ? (
            <input
              value={data.title}
              onChange={e => update(d => ({ ...d, title: e.target.value }))}
              style={{ ...iBase, fontSize: 24, fontWeight: 700, background: 'transparent',
                border: `1px solid ${BRAND.borderMid}`, padding: '4px 8px',
                color: BRAND.white, width: 480 }}
            />
          ) : (
            <h1 style={{ fontSize: 24, fontWeight: 700, color: BRAND.white, margin: 0 }}>
              {data.title}
            </h1>
          )}

          {edit ? (
            <input
              value={data.subtitle}
              onChange={e => update(d => ({ ...d, subtitle: e.target.value }))}
              style={{ ...iBase, fontSize: 14, color: BRAND.grayMid,
                background: 'transparent', border: `1px solid ${BRAND.borderMid}`,
                marginTop: 6, width: 600 }}
            />
          ) : (
            <p style={{ fontSize: 14, color: BRAND.grayMid, marginTop: 6, marginBottom: 0 }}>
              {data.subtitle}
            </p>
          )}
        </div>

        {/* ── Alert ── */}
        <div style={{
          display: 'flex', gap: 14, alignItems: 'flex-start',
          background: `${BRAND.yellow}12`,
          border: `1px solid ${BRAND.yellow}33`,
          borderLeft: `3px solid ${BRAND.yellow}`,
          borderRadius: '0 4px 4px 0',
          padding: '12px 16px', marginBottom: 32,
        }}>
          <div style={{ width: 2, flexShrink: 0 }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em',
              color: BRAND.yellow, textTransform: 'uppercase', marginBottom: 5 }}>
              ACCION CRITICA PARALELA
            </div>
            {edit ? (
              <textarea
                value={data.alert}
                onChange={e => update(d => ({ ...d, alert: e.target.value }))}
                style={{ ...iBase, minHeight: 52, resize: 'vertical', lineHeight: 1.6,
                  color: '#d97706', background: 'transparent',
                  border: `1px solid ${BRAND.yellow}20` } as React.CSSProperties}
              />
            ) : (
              <div style={{ fontSize: 14, color: '#d97706', lineHeight: 1.7 }}>
                {data.alert}
              </div>
            )}
          </div>
        </div>

        {/* ── Gantt ── */}
        <div style={{ minWidth: LABEL_W + chartW }}>

          {/* Week header */}
          <div style={{ display: 'flex', paddingLeft: LABEL_W, marginBottom: 10 }}>
            {data.weeks.map((w, i) => (
              <div key={i} style={{
                width: CELL_W, flexShrink: 0, textAlign: 'center', fontSize: 12,
                letterSpacing: '0.06em',
                color: i === 0 ? BRAND.yellow : i === nW - 1 ? BRAND.white : BRAND.textMid,
                fontWeight: (i === 0 || i === nW - 1) ? 700 : 400,
              }}>
                {w}
                {i === 0 && (
                  <div style={{ fontSize: 9, color: BRAND.yellow, marginTop: 2,
                    fontWeight: 700, letterSpacing: '0.1em' }}>HOY</div>
                )}
                {i === nW - 1 && (
                  <div style={{ fontSize: 9, color: BRAND.white, marginTop: 2,
                    fontWeight: 700, letterSpacing: '0.1em' }}>LAUNCH</div>
                )}
              </div>
            ))}
          </div>

          <div style={{ height: 1, background: BRAND.border, marginBottom: 12 }}/>

          {/* Transbank parallel track */}
          <div style={{ display: 'flex', alignItems: 'center', height: ROW_H, marginBottom: 20 }}>
            <div style={{ width: LABEL_W, flexShrink: 0, paddingLeft: 4, paddingRight: 8 }}>
              <div style={{ fontSize: 14, color: BRAND.yellow, fontWeight: 700,
                letterSpacing: '0.02em', lineHeight: 1.3 }}>
                Transbank onboarding{' '}
                <span style={{ fontWeight: 400, color: '#d97706' }}>[externo — iniciar hoy]</span>
              </div>
            </div>
            <div style={{ width: chartW, position: 'relative', height: '100%', flexShrink: 0 }}>
              {Array.from({ length: nW }, (_, i) => <GridLine key={i} i={i} n={nW} />)}
              <div style={{
                position: 'absolute', left: 2, top: '50%', width: 8 * CELL_W - 4, height: 16,
                transform: 'translateY(-50%)',
                background: `${BRAND.yellow}15`,
                border: `1px dashed ${BRAND.yellow}66`,
                borderRadius: 2,
                display: 'flex', alignItems: 'center', paddingLeft: 10,
                fontSize: 11, color: BRAND.yellowHi, letterSpacing: '0.12em',
              }}>
                SEMANAS 1–8
              </div>
            </div>
          </div>

          {/* Phases */}
          {data.phases.map(phase => (
            <div key={phase.id} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', height: 26,
                paddingLeft: 4, marginBottom: 4, gap: 10 }}>
                <div style={{ width: 3, height: 14, background: phase.color,
                  borderRadius: 1, flexShrink: 0 }}/>
                <div style={{ fontSize: 13, fontWeight: 700, color: phase.color,
                  letterSpacing: '0.14em', flex: 1 }}>
                  {phase.label}
                </div>
                {edit && (
                  <div style={{ display: 'flex', gap: 4, marginRight: 4 }}>
                    <Btn onClick={() => setSel({ type: 'phase', phaseId: phase.id })} label="✎"/>
                    <Btn onClick={() => {
                      if (window.confirm(`¿Eliminar "${phase.label}"?`)) {
                        update(d => ({ ...d, phases: d.phases.filter(p => p.id !== phase.id) }))
                        setSel(null)
                      }
                    }} label="×" danger/>
                  </div>
                )}
              </div>

              {phase.tasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  phase={phase}
                  totalWeeks={nW}
                  editMode={edit}
                  chartW={chartW}
                  isSelected={sel?.taskId === task.id}
                  onSelect={() => setSel({ type: 'task', phaseId: phase.id, taskId: task.id })}
                  onDelete={() => {
                    update(d => ({ ...d, phases: d.phases.map(p =>
                      p.id !== phase.id ? p : { ...p, tasks: p.tasks.filter(t => t.id !== task.id) }
                    )}))
                    setSel(null)
                  }}
                />
              ))}

              {edit && (
                <div
                  onClick={() => {
                    const id = gid()
                    const s  = phase.tasks.length ? phase.tasks[phase.tasks.length - 1].e : 1
                    update(d => ({ ...d, phases: d.phases.map(p =>
                      p.id !== phase.id ? p : { ...p, tasks: [...p.tasks,
                        { id, name: 'Nueva tarea', s, e: s, hot: false }
                      ]}
                    )}))
                    setSel({ type: 'task', phaseId: phase.id, taskId: id })
                  }}
                  style={{ height: 30, display: 'flex', alignItems: 'center',
                    paddingLeft: 22, cursor: 'pointer', fontSize: 13, color: BRAND.textMid }}
                >
                  + agregar tarea
                </div>
              )}
            </div>
          ))}

          {edit && (
            <div
              onClick={() => {
                const id = gid()
                update(d => ({ ...d, phases: [...d.phases,
                  { id, label: `FASE ${d.phases.length} · NUEVA FASE`, color: '#6366f1', tasks: [] }
                ]}))
                setSel({ type: 'phase', phaseId: id })
              }}
              style={{ height: ROW_H, display: 'flex', alignItems: 'center',
                cursor: 'pointer', paddingLeft: 4, fontSize: 13, color: BRAND.textMid }}
            >
              + agregar fase
            </div>
          )}
        </div>

        {/* ── Sequencing rationale ── */}
        <div style={{ marginTop: 40, border: `1px solid ${BRAND.border}`,
          borderRadius: 4, padding: '20px 22px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.22em',
            color: BRAND.textMid, textTransform: 'uppercase', marginBottom: 16 }}>
            Lógica de Secuenciación
          </div>
          {data.findings.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'flex-start',
              gap: 12, marginBottom: 10 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: f.color,
                flexShrink: 0, marginTop: 6 }}/>
              {edit ? (
                <div style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center' }}>
                  <input
                    value={f.text}
                    onChange={e => update(d => ({ ...d, findings: d.findings.map(fi =>
                      fi.id !== f.id ? fi : { ...fi, text: e.target.value }
                    )}))}
                    style={{ ...iBase, flex: 1, fontSize: 14 }}
                  />
                  <Btn onClick={() => update(d => ({
                    ...d, findings: d.findings.filter(fi => fi.id !== f.id)
                  }))} label="×" danger/>
                </div>
              ) : (
                <div style={{ fontSize: 14, color: BRAND.grayDark, lineHeight: 1.6, flex: 1 }}>
                  {f.text}
                </div>
              )}
            </div>
          ))}
          {edit && (
            <div
              onClick={() => update(d => ({ ...d, findings: [...d.findings,
                { id: gid(), color: BRAND.yellow, text: 'Nuevo punto de lógica' }
              ]}))}
              style={{ cursor: 'pointer', fontSize: 13, color: BRAND.textMid,
                marginTop: 8, paddingLeft: 16 }}
            >
              + agregar punto
            </div>
          )}
        </div>

        {/* ── Audit note ── */}
        <div style={{
          marginTop: 12,
          background: `${BRAND.yellow}0c`,
          border: `1px solid ${BRAND.yellow}25`,
          borderLeft: `3px solid ${BRAND.yellow}55`,
          borderRadius: '0 4px 4px 0',
          padding: '12px 18px', fontSize: 14, lineHeight: 1.7,
        }}>
          <span style={{ color: BRAND.yellow, fontWeight: 700 }}>Hallazgo del audit: </span>
          <span style={{ color: '#d97706' }}>
            El sistema de sesiones consultor existente (11 tablas, completamente operacional) se mapea casi directamente a sesiones uno-a-uno del asesor. La Fase 2 es más rápida de lo que parece. Los 9 roles actuales son FNE-internos — agregar asesor/estudiante/familia en Semana 1 debe hacerse sin romper los flujos de colegio/consultor existentes.
          </span>
        </div>

        {/* ── Footer spacer ── */}
        <div style={{ height: 40 }}/>

      </div>

      {/* ── Edit side panel ── */}
      {edit && sel && (
        <EditPanel selected={sel} data={data} update={update} onClose={() => setSel(null)} />
      )}

      </div>{/* ── end row wrapper ── */}

      {/* ── Bottom bar ── */}
      <div style={{
        flexShrink: 0, zIndex: 100,
        background: BRAND.bgCard,
        borderTop: `1px solid ${BRAND.border}`,
        padding: '8px 20px',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button
          onClick={() => { setEdit(e => !e); setSel(null) }}
          style={{
            background: edit ? BRAND.yellow : 'transparent',
            border: `1px solid ${edit ? BRAND.yellow : BRAND.borderMid}`,
            color: edit ? BRAND.bg : BRAND.grayMid,
            borderRadius: 3, padding: '5px 18px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', letterSpacing: '0.15em',
            textTransform: 'uppercase', transition: 'all 0.15s',
          }}
        >
          {edit ? 'SALIR DE EDICION' : 'EDITAR'}
        </button>

        <div style={{ fontSize: 13, minWidth: 80 }}>
          {saving && <span style={{ color: BRAND.textMid, letterSpacing: '0.1em' }}>GUARDANDO...</span>}
          {saved && !saving && <span style={{ color: BRAND.yellow, letterSpacing: '0.1em' }}>GUARDADO</span>}
        </div>

        <div style={{ flex: 1 }}/>
      </div>

    </div>
  )
}
