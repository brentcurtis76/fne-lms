/**
 * PreviewDocument — wraps a template in a @react-pdf/renderer Document.
 *
 * This module is imported ONLY via dynamic import with ssr:false from
 * ProposalPreview. It must never be imported in a server-side context.
 *
 * Using public-URL logo paths (via browser-safe fonts.ts / CoverPage / DarkSection)
 * so @react-pdf/renderer can fetch them from the Next.js dev/prod server.
 */
import React from 'react';
import { Document } from '@react-pdf/renderer';
import { EvolucionaTemplate } from './templates/EvolucionaTemplate';
import { PreparacionTemplate } from './templates/PreparacionTemplate';
import type { ProposalConfig } from './generator';

interface PreviewDocumentProps {
  config: ProposalConfig;
}

export function PreviewDocument({ config }: PreviewDocumentProps) {
  const Template =
    config.type === 'evoluciona' ? EvolucionaTemplate : PreparacionTemplate;

  return (
    <Document title={config.serviceName}>
      <Template config={config} />
    </Document>
  );
}
