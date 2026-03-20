import { useState, FormEvent } from 'react';
import Image from 'next/image';
import { Loader2, Lock } from 'lucide-react';
import type { ProposalSnapshot } from '@/lib/propuestas-web/snapshot';

interface ProposalMetadata {
  schoolName: string;
  serviceName: string;
  type: string;
}

interface ProposalUnlockScreenProps {
  metadata: ProposalMetadata;
  onUnlock: (snapshot: ProposalSnapshot, code: string) => void;
  slug: string;
}

export default function ProposalUnlockScreen({
  metadata,
  onUnlock,
  slug,
}: ProposalUnlockScreenProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || loading) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/propuestas/web/${slug}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.toUpperCase() }),
      });

      const json = await res.json();

      if (res.ok && json.data?.snapshot) {
        onUnlock(json.data.snapshot, code.toUpperCase());
      } else {
        setError(json.error || 'Código incorrecto');
        if (json.remaining != null) {
          setRemaining(json.remaining);
        }
      }
    } catch {
      setError('Error de conexión. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="mb-10">
          <Image
            src="/logos/fne-logo-gold.png"
            alt="Fundación Nueva Educación"
            width={180}
            height={60}
            className="mx-auto"
          />
        </div>

        {/* School info */}
        <h1 className="text-white text-2xl font-bold mb-2">{metadata.schoolName}</h1>
        <p className="text-white/60 text-lg mb-10">{metadata.serviceName}</p>

        {/* Lock icon */}
        <div className="mb-6">
          <Lock size={32} className="text-[#fbbf24] mx-auto" />
        </div>

        {/* Code form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="CÓDIGO DE ACCESO"
              className="w-full border-2 border-[#fbbf24] bg-transparent text-white text-center text-2xl tracking-[0.3em] uppercase rounded-2xl px-4 py-4 placeholder:text-[#6b7280] placeholder:text-base placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-[#fbbf24]/50"
              autoComplete="off"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm">
              <p>{error}</p>
              {remaining != null && (
                <p className="mt-1 text-red-400/70">
                  {remaining > 0
                    ? `${remaining} intento${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''}`
                    : 'Demasiados intentos. Intenta más tarde.'}
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full bg-[#fbbf24] text-[#0a0a0a] rounded-full px-8 py-3 font-bold hover:bg-[#f59e0b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={20} className="animate-spin" />
                Verificando...
              </span>
            ) : (
              'Acceder a la Propuesta'
            )}
          </button>
        </form>

        {/* Footer hint */}
        <p className="text-white/30 text-xs mt-10">
          Ingresa el código que te fue enviado por tu consultor FNE
        </p>
      </div>
    </div>
  );
}
