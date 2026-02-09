import '../styles/globals.css';
import '../styles/notifications.css';
import type { AppProps } from 'next/app';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs';

import Head from 'next/head';
import { Toaster } from 'react-hot-toast';

import { toasterConfig } from '../constants/toastStyles';
import { useEnvironmentValidation } from '../lib/utils/environmentMonitor';
import { PermissionProvider } from '../contexts/PermissionContext';
import { AuthProvider } from '../contexts/AuthContext';
import DynamicFavicon from '../components/DynamicFavicon';
import { QASessionProvider } from '../components/qa/QASessionProvider';
import { useWebVitals } from '../hooks/useWebVitals';

// Create a singleton Supabase client
const supabaseClient = createPagesBrowserClient();

export default function MyApp({ Component, pageProps }: AppProps) {
  // Environment validation on app startup
  useEnvironmentValidation();

  // Collect Core Web Vitals for QA monitoring (enabled in production)
  useWebVitals(process.env.NODE_ENV === 'production');

  return (
    <SessionContextProvider supabaseClient={supabaseClient} initialSession={pageProps.initialSession}>
      <AuthProvider>
      <PermissionProvider>
        <Head>
          <title>Genera</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="theme-color" content="#0a0a0a" />

          {/* App metadata */}
          <meta name="description" content="Hub de Transformación Educativa - Genera" />
          <meta name="application-name" content="Genera" />

          {/* PWA Support */}
          <link rel="manifest" href="/manifest.json" />
        </Head>
        {/* Dynamic favicon based on route */}
        <DynamicFavicon />
        <QASessionProvider>
          <Component {...pageProps} />
          <Toaster
            position="bottom-right"
            reverseOrder={false}
            toastOptions={toasterConfig}
            containerStyle={{
              bottom: 24,
              right: 24,
            }}
          />
        </QASessionProvider>
      </PermissionProvider>
      </AuthProvider>
    </SessionContextProvider>
  );
}