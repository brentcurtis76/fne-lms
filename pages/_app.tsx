import '../styles/globals.css';
import '../styles/notifications.css';
import type { AppProps } from 'next/app';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs';

import Head from 'next/head';
import { Toaster } from 'react-hot-toast';

import { toasterConfig } from '../constants/toastStyles';

// Create a singleton Supabase client
const supabaseClient = createPagesBrowserClient();

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <SessionContextProvider supabaseClient={supabaseClient} initialSession={pageProps.initialSession}>
      <Head>
        <title>FNE LMS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        
        {/* Favicon */}
        <link rel="icon" href="/favicon.ico?v=2" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=2" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon.png?v=2" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon.png?v=2" />
        <meta name="theme-color" content="#00365b" />
        
        {/* App metadata */}
        <meta name="description" content="Plataforma de aprendizaje de Fundación Nueva Educación" />
        <meta name="application-name" content="FNE LMS" />
        
        {/* PWA Support */}
        <link rel="manifest" href="/manifest.json" />
      </Head>
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
    </SessionContextProvider>
  );
}