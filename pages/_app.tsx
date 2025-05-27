import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs';
import { useState } from 'react';
import Head from 'next/head';
import { Toaster } from 'react-hot-toast';

// Create a singleton Supabase client to avoid multiple instances warning
let supabaseClient: any;
if (typeof window !== 'undefined') {
  if (!supabaseClient) {
    supabaseClient = createPagesBrowserClient();
  }
}

export default function MyApp({ Component, pageProps }: AppProps) {
  const [client] = useState(() => supabaseClient || createPagesBrowserClient());

  return (
    <SessionContextProvider supabaseClient={client} initialSession={pageProps.initialSession}>
      <Head>
        <title>FNE LMS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        
        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon.svg" />
        <meta name="theme-color" content="#00365b" />
        
        {/* App metadata */}
        <meta name="description" content="Plataforma de aprendizaje de Fundación Nueva Educación" />
        <meta name="application-name" content="FNE LMS" />
      </Head>
      <Component {...pageProps} />
      <Toaster position="bottom-right" reverseOrder={false} />
    </SessionContextProvider>
  );
}