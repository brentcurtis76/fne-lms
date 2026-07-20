import React from 'react';
import Head from 'next/head';
import PrivacyPolicyContent from '../components/PrivacyPolicyContent';

/**
 * Standalone public privacy-policy page (Ley 21.719). Linked from the consent
 * checkboxes on the public signup forms (/registro, /registro-tractor) and
 * shares its content with the footer's PrivacyPolicyModal.
 */
export default function PrivacidadPage() {
  return (
    <>
      <Head>
        <title>Política de Privacidad · Genera</title>
        <meta
          name="description"
          content="Política de privacidad de la plataforma Genera de la Fundación Nueva Educación (Ley 21.719)."
        />
        <meta name="theme-color" content="#0a0a0a" />
      </Head>

      <main className="min-h-screen bg-white font-mont text-brand_primary">
        <header className="bg-brand_primary px-7 py-8 min-[901px]:px-[52px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/genera/logo-horizontal-on-dark.svg"
            alt="Genera · Hub de Transformación"
            className="h-[40px] w-auto"
          />
        </header>

        <div className="mx-auto w-full max-w-[760px] px-7 pb-16 pt-10">
          <h1 className="mb-6 text-[28px] font-bold tracking-[-.01em] text-brand_primary">
            Política de Privacidad
          </h1>
          <PrivacyPolicyContent />
        </div>

        <footer className="border-t border-gray-200 px-7 py-6 text-[12px] font-medium text-gray-400">
          © 2026 Fundación Nueva Educación · Santiago, Chile
        </footer>
      </main>
    </>
  );
}
