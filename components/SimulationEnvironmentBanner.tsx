import React from 'react';
import Head from 'next/head';
import { QA_SIMULATION_LABEL } from '../lib/simulation/constants';

export default function SimulationEnvironmentBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <>
      <Head>
        <meta name="robots" content="noindex,nofollow,noarchive" />
      </Head>
      <div
        role="status"
        aria-label="Entorno de simulación QA"
        data-testid="qa-simulation-banner"
        className="border-b border-amber-950 bg-amber-300 px-4 py-2 text-center text-xs font-extrabold tracking-wide text-amber-950 sm:text-sm"
      >
        {QA_SIMULATION_LABEL}
      </div>
    </>
  );
}
