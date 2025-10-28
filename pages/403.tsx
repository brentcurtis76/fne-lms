import Link from 'next/link';
import Head from 'next/head';

export default function ForbiddenPage() {
  return (
    <>
      <Head>
        <title>403 · Acceso restringido</title>
      </Head>
      <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6">
        <div className="max-w-lg text-center bg-white border border-slate-200 rounded-xl shadow-sm p-10 space-y-6">
          <p className="text-sm font-semibold text-amber-600">403 · Acceso restringido</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            No tienes permisos para acceder a esta sección.
          </h1>
          <p className="text-slate-600">
            Si necesitabas revisar las métricas de Vías de Transformación u otra vista administrativa,
            solicita a un administrador que habilite tu rol (admin o consultor).
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-6 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 transition"
            >
              Volver al inicio
            </Link>
            <a
              href="mailto:soporte@nuevaeducacion.org?subject=Acceso%20V%C3%ADas%20de%20Transformaci%C3%B3n"
              className="inline-flex items-center justify-center px-6 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition"
            >
              Contactar soporte
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
