import '../styles/globals.css';
import '../styles/notifications.css';
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
        
        {/* Global fonts and stylesheets */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link 
          rel="stylesheet" 
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" 
          integrity="sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw==" 
          crossOrigin="anonymous" 
          referrerPolicy="no-referrer" 
        />
      </Head>
      <Component {...pageProps} />
      <Toaster position="bottom-right" reverseOrder={false} />
    </SessionContextProvider>
  );
}