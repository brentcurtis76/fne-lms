import React from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface LlmUsageRow {
  id: string;
  user_id: string;
  assessment_id: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  created_at: string;
}

interface ConversationMessageRow {
  id: string;
  assessment_id: string;
  rubric_item_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

interface MetricsPageProps {
  usage: LlmUsageRow[];
  messages: ConversationMessageRow[];
  sampleAssessmentId?: string | null;
  communities: Array<{ id: string; name: string; transformation_enabled: boolean }>;
}

export const getServerSideProps: GetServerSideProps<MetricsPageProps> = async (ctx) => {
  const supabase = createPagesServerClient(ctx);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      redirect: {
        destination: '/auth/login?redirect=/admin/transformation/metrics',
        permanent: false,
      },
    };
  }

  const { data: dbRoles } = await supabase
    .from('user_roles')
    .select('role_type')
    .eq('user_id', session.user.id)
    .eq('is_active', true);

  const roles = new Set<string>([
    ...(session.user.user_metadata?.roles ?? []),
    ...(dbRoles?.map((row) => row.role_type) ?? []),
  ]);

  const isAdmin = roles.has('admin') || roles.has('consultor');
  const env = process.env.NODE_ENV;
  console.debug('[transformation metrics] roles detectados', roles, 'env:', env);

  if (!isAdmin) {
    if (env !== 'production') {
      console.warn('[transformation metrics] Acceso permitido en modo desarrollo para depurar roles');
    } else {
      return {
        redirect: { destination: '/403', permanent: false },
      };
    }
  }

  const [{ data: usage }, { data: messages }, { data: communityRows }] = await Promise.all([
    supabase
      .from('transformation_llm_usage')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('transformation_conversation_messages')
      .select('id, assessment_id, rubric_item_id, role, content, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('user_roles')
      .select('community_id, growth_communities(id, name, transformation_enabled)')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .not('community_id', 'is', null),
  ]);

  return {
    props: {
      usage: usage ?? [],
      messages: messages ?? [],
      sampleAssessmentId: usage && usage.length > 0 ? usage[usage.length - 1].assessment_id : null,
      communities:
        communityRows
          ?.map((row: any) => {
            const gc = Array.isArray(row.growth_communities) ? row.growth_communities[0] : row.growth_communities;
            return {
              id: gc?.id ?? row.community_id,
              name: gc?.name ?? 'Comunidad sin nombre',
              transformation_enabled: gc?.transformation_enabled ?? false,
            };
          })
          .filter((item: any) => Boolean(item.id)) ?? [],
    },
  };
};

function formatRelative(dateString: string) {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: es });
  } catch {
    return dateString;
  }
}

export default function TransformationMetricsPage({ usage, messages, sampleAssessmentId, communities }: MetricsPageProps) {
  const [showCreate, setShowCreate] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    setShowCreate(url.searchParams.get('action') === 'create-assessment');
  }, []);
  const [selectedCommunity, setSelectedCommunity] = React.useState<string>('');
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedCommunity && communities.length > 0) {
      setSelectedCommunity(communities[0].id);
    }
  }, [communities, selectedCommunity]);

  const handleCreate = async () => {
    if (!selectedCommunity) {
      setCreateError('Selecciona una comunidad piloto.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch('/api/transformation/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId: selectedCommunity, area: 'personalizacion' }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'No se pudo crear la evaluación.');
      }
      const body = await response.json();
      window.location.href = `/community/workspace/transformation/evaluate?assessmentId=${body.assessmentId}`;
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Error inesperado al crear la evaluación.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Head>
        <title>Vías de Transformación – Métricas</title>
      </Head>
      <main className="px-6 py-8 space-y-10">
        <header>
          <nav className="text-sm text-slate-500 mb-2">
            <Link href="/admin">Administración</Link>
            {' / '}
            <span>Vías de Transformación</span>
            {' / '}
            <strong>Métricas</strong>
          </nav>
          <h1 className="text-2xl font-semibold text-slate-900">
            Vías de Transformación · Métricas de Conversación
          </h1>
          <div className="text-slate-600 mt-2 space-y-2 text-sm">
            <p>
              Consolida el uso del asistente conversacional y el historial más reciente de mensajes.
              Esta vista es solo para revisión interna (admins/consultores).
            </p>
            <p className="text-slate-500">
              Para generar datos de prueba visita cualquier assessment, envía mensajes y vuelve aquí.
              {sampleAssessmentId && (
                <>
                  {' '}Ejemplo reciente:{' '}
                  <code className="bg-slate-100 rounded px-1 py-0.5 text-xs font-mono">
                    {sampleAssessmentId}
                  </code>
                </>
              )}
            </p>
          </div>
        </header>

        <section className="bg-white rounded-lg shadow border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Uso del LLM (últimas 50 llamadas)</h2>
            <p className="text-sm text-slate-600">
              Tokens, latencia y modelo utilizados en cada request para detectar costos y problemas de
              rendimiento.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Fecha</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Usuario</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Assessment</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Modelo</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700">Tokens (in/out)</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700">Latencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {usage.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      Aún no se registran llamadas al asistente.
                    </td>
                  </tr>
                )}
                {usage.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-2 text-slate-700">{formatRelative(row.created_at)}</td>
                    <td className="px-4 py-2 font-mono text-slate-600 text-xs">{row.user_id}</td>
                    <td className="px-4 py-2 font-mono text-slate-600 text-xs">{row.assessment_id}</td>
                    <td className="px-4 py-2 text-slate-700">{row.model}</td>
                    <td className="px-4 py-2 text-right text-slate-700">
                      {row.input_tokens ?? '—'} / {row.output_tokens ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">
                      {row.latency_ms ? `${row.latency_ms} ms` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-lg shadow border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Historial reciente (últimos 50 mensajes)</h2>
            <p className="text-sm text-slate-600">
              Registra cada turno de la conversación para auditoría y revisiones puntuales.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Fecha</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Assessment</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Rúbrica</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Rol</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Contenido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {messages.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      No hay mensajes registrados todavía.
                    </td>
                  </tr>
                )}
                {messages.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-2 text-slate-700">{formatRelative(row.created_at)}</td>
                    <td className="px-4 py-2 font-mono text-slate-600 text-xs">{row.assessment_id}</td>
                    <td className="px-4 py-2 font-mono text-slate-600 text-xs">{row.rubric_item_id}</td>
                    <td className="px-4 py-2 text-slate-700 capitalize">{row.role}</td>
                    <td className="px-4 py-2 text-slate-700 max-w-2xl whitespace-pre-wrap">
                      {row.content}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-lg shadow border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Crear evaluación piloto</h2>
              <p className="text-sm text-slate-600">
                Selecciona la comunidad habilitada y genera el assessment inicial de personalización.
              </p>
            </div>
            <button
              onClick={() => setShowCreate((prev) => !prev)}
              className="text-sm font-semibold text-sky-600 hover:text-sky-500"
            >
              {showCreate ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          {showCreate && (
            <div className="px-6 py-4 space-y-4">
              {communities.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No tienes comunidades habilitadas con la Vía de Transformación. Activa el flag{' '}
                  <code className="bg-slate-100 px-1 py-0.5 rounded">transformation_enabled</code> desde la consola
                  o asigna tu usuario a la comunidad piloto.
                </p>
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-slate-700">Comunidad</label>
                  <select
                    value={selectedCommunity}
                    onChange={(event) => setSelectedCommunity(event.target.value)}
                    className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  >
                    {communities.map((community) => (
                      <option key={community.id} value={community.id}>
                        {community.name} {community.transformation_enabled ? '' : '(flag desactivado)'}
                      </option>
                    ))}
                  </select>
                  {createError && (
                    <p className="text-sm text-rose-600">{createError}</p>
                  )}
                  <button
                    onClick={handleCreate}
                    disabled={creating || !selectedCommunity}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#00365b] text-white text-sm font-semibold rounded-lg hover:bg-[#002645] transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {creating ? 'Creando...' : 'Crear evaluación'}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
