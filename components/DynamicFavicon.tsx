/**
 * DynamicFavicon Component
 * Renders the appropriate favicon based on the current page context
 * - Platform pages (dashboard, profile, etc.) and login: Genera favicon
 * - Public website pages (home, nosotros, programas, etc.): FNE favicon
 */

import Head from 'next/head';
import { useRouter } from 'next/router';

// Routes that should use Genera favicon (platform + login)
const GENERA_ROUTES = [
  '/login',
  '/register',
  '/reset-password',
  '/change-password',
  '/dashboard',
  '/profile',
  '/admin',
  '/docente',
  '/directivo',
  '/estudiante',
  '/consultor',
  '/community',
  '/courses',
  '/workspace',
  '/messages',
  '/notifications',
  '/assessments',
  '/transformation',
  '/brand-preview',
  '/mi-aprendizaje',
  '/my-paths',
  '/student',
  '/quiz-reviews',
  '/assignments',
  '/reports',
  '/detailed-reports',
  '/equipo',
  '/contracts',
  '/expense-reports',
  '/user',
  '/vias-transformacion',
  '/school',
];

export default function DynamicFavicon() {
  const router = useRouter();
  const pathname = router.pathname;

  // Check if current route should use Genera favicon
  const isGeneraRoute = GENERA_ROUTES.some(route =>
    pathname === route || pathname.startsWith(`${route}/`)
  );

  const faviconPath = isGeneraRoute ? '/genera/genera-favicon.svg' : '/favicon-fne.png';
  const faviconPngPath = isGeneraRoute ? '/genera/favicon-32.png' : '/favicon-fne.png';

  return (
    <Head>
      {isGeneraRoute ? (
        <>
          <link rel="icon" type="image/svg+xml" href="/genera/genera-favicon.svg" />
          <link rel="icon" type="image/png" sizes="32x32" href="/genera/favicon-32.png" />
          <link rel="apple-touch-icon" href="/genera/app-icon-180.png" />
        </>
      ) : (
        <>
          <link rel="icon" type="image/png" href="/favicon-fne.png" />
          <link rel="apple-touch-icon" href="/favicon-fne.png" />
        </>
      )}
    </Head>
  );
}
