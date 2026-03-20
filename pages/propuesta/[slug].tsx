import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Loader2 } from 'lucide-react';
import type { ProposalSnapshot } from '@/lib/propuestas-web/snapshot';
import ProposalUnlockScreen from '@/components/propuestas-web/ProposalUnlockScreen';
import ProposalPublicView from '@/components/propuestas-web/ProposalPublicView';

interface ProposalMetadata {
  slug: string;
  status: string;
  schoolName: string;
  serviceName: string;
  type: string;
  programYear: number;
}

const SESSION_KEY_PREFIX = 'propuesta_code_';

export default function PublicProposalPage() {
  const router = useRouter();
  const { slug } = router.query;

  const [metadata, setMetadata] = useState<ProposalMetadata | null>(null);
  const [snapshot, setSnapshot] = useState<ProposalSnapshot | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchMetadata = useCallback(async (s: string) => {
    try {
      const res = await fetch(`/api/propuestas/web/${s}`);
      const json = await res.json();

      if (res.ok && json.data) {
        setMetadata(json.data);
      } else if (res.status === 410) {
        setError('Esta propuesta ha expirado y ya no está disponible.');
      } else {
        setError(json.error || 'Propuesta no encontrada');
      }
    } catch {
      setError('Error al cargar la propuesta');
    } finally {
      setLoading(false);
    }
  }, []);

  // Try to restore session from sessionStorage
  const tryRestoreSession = useCallback(
    async (s: string) => {
      const storedCode = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${s}`);
      if (!storedCode) return false;

      try {
        const res = await fetch(`/api/propuestas/web/${s}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: storedCode }),
        });

        const json = await res.json();
        if (res.ok && json.data?.snapshot) {
          setSnapshot(json.data.snapshot);
          setAccessCode(storedCode);
          return true;
        }
      } catch {
        // Session restore failed, show unlock screen
      }

      // Clear invalid stored code
      sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${s}`);
      return false;
    },
    []
  );

  useEffect(() => {
    if (!slug || typeof slug !== 'string') return;

    const init = async () => {
      // Admin bypass — skip unlock screen if authenticated as admin
      if (router.query.admin === 'true') {
        try {
          const adminRes = await fetch(`/api/propuestas/web/${slug}/admin-access`, {
            credentials: 'include',
          });
          if (adminRes.ok) {
            const adminJson = await adminRes.json();
            if (adminJson.data?.snapshot) {
              setSnapshot(adminJson.data.snapshot);
              await fetchMetadata(slug);
              return;
            }
          }
        } catch {
          // Fall through to normal flow
        }
      }

      // Try restoring session first
      const restored = await tryRestoreSession(slug);
      if (restored) {
        // Still fetch metadata for Head tags
        await fetchMetadata(slug);
        return;
      }
      await fetchMetadata(slug);
    };

    init();
  }, [slug, fetchMetadata, tryRestoreSession]);

  const handleUnlockWithCode = (snap: ProposalSnapshot, code: string) => {
    setSnapshot(snap);
    setAccessCode(code);
    if (typeof slug === 'string') {
      sessionStorage.setItem(`${SESSION_KEY_PREFIX}${slug}`, code);
    }
  };

  // Loading state
  if (loading && !snapshot) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Head>
          <title>Cargando Propuesta - Fundación Nueva Educación</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-[#fbbf24]" />
          <p className="text-white/60">Cargando propuesta...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
        <Head>
          <title>Error - Fundación Nueva Educación</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className="text-center max-w-md">
          <div className="bg-white/10 rounded-2xl p-8">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-red-400 text-3xl">!</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Propuesta no disponible</h1>
            <p className="text-white/60 mb-6">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="bg-[#fbbf24] text-[#0a0a0a] rounded-full px-6 py-3 font-medium hover:bg-[#f59e0b] transition-colors"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Unlocked — show full proposal
  if (snapshot && metadata) {
    const pageTitle = `${metadata.serviceName} - ${metadata.schoolName}`;

    return (
      <>
        <Head>
          <title>{pageTitle} - Fundación Nueva Educación</title>
          <meta
            name="description"
            content={`Propuesta de consultoría educativa para ${metadata.schoolName}. ${metadata.serviceName} ${metadata.programYear}.`}
          />
          <meta name="robots" content="noindex, nofollow" />
          <meta property="og:title" content={pageTitle} />
          <meta
            property="og:description"
            content={`Propuesta personalizada de consultoría educativa para ${metadata.schoolName}`}
          />
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="Fundación Nueva Educación" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <ProposalPublicView snapshot={snapshot} slug={slug as string} accessCode={accessCode} />
      </>
    );
  }

  // Locked — show unlock screen
  if (metadata) {
    return (
      <>
        <Head>
          <title>Propuesta para {metadata.schoolName} - Fundación Nueva Educación</title>
          <meta name="robots" content="noindex, nofollow" />
          <meta property="og:title" content={`Propuesta para ${metadata.schoolName}`} />
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="Fundación Nueva Educación" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <ProposalUnlockScreen
          metadata={{
            schoolName: metadata.schoolName,
            serviceName: metadata.serviceName,
            type: metadata.type,
          }}
          onUnlock={handleUnlockWithCode}
          slug={slug as string}
        />
      </>
    );
  }

  return null;
}
