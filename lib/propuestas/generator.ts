/**
 * Proposal Generator — main orchestrator
 * Renders PDF from template config and optionally merges supporting docs.
 */
import React from 'react';
import { Document, renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import './fonts';

// ============================================================
// Config types
// ============================================================

export interface ConsultantInfo {
  nombre: string;
  titulo: string;
  bio: string;
  fotoPath?: string;
}

export interface ModuleInfo {
  nombre: string;
  horas_presenciales: number;
  horas_sincronicas: number;
  horas_asincronicas: number;
  /** 1-based month number for timeline placement */
  mes?: number;
}

export interface PricingInfo {
  mode: 'per_hour' | 'fixed';
  precioUf: number;
  totalHours: number;
  formaPago: string;
  /** Only used when mode === 'fixed' */
  fixedUf?: number;
}

export interface ContentSectionData {
  type: 'heading' | 'paragraph' | 'list' | 'image';
  text?: string;
  items?: string[];
  /** Local file path or storage path for image sections */
  path?: string;
  level?: number;
}

export interface ContentBlockData {
  key: string;
  titulo: string;
  contenido: {
    sections: ContentSectionData[];
  };
  imagenes?: Array<{ key: string; path: string; alt: string }> | null;
}

export interface ProposalConfig {
  type: 'evoluciona' | 'preparacion';
  schoolName: string;
  schoolLogoPath?: string;
  programYear: number;
  serviceName: string;
  consultants: ConsultantInfo[];
  modules: ModuleInfo[];
  horasPresenciales: number;
  horasSincronicas: number;
  horasAsincronicas: number;
  pricing: PricingInfo;
  contentBlocks: ContentBlockData[];
  /** Supabase storage paths to append after main PDF */
  supportingDocuments?: string[];
  /** 1-based month number when the program starts (default: 3 = March) */
  startMonth?: number;
  /** Program duration in months (default: 10) */
  duration?: number;
}

// ============================================================
// Generator
// ============================================================

export async function generateProposal(config: ProposalConfig): Promise<Buffer> {
  // Lazy-import templates to avoid circular dependency issues at module load
  const { EvolucionaTemplate } = await import('./templates/EvolucionaTemplate');
  const { PreparacionTemplate } = await import('./templates/PreparacionTemplate');

  const TemplateComponent =
    config.type === 'evoluciona' ? EvolucionaTemplate : PreparacionTemplate;

  const doc = React.createElement(
    Document,
    { title: config.serviceName },
    React.createElement(TemplateComponent, { config })
  );

  let mainPdf: Buffer;
  try {
    mainPdf = await renderToBuffer(doc);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `PDF render failed for template "${config.type}" / school "${config.schoolName}": ${detail}`
    );
  }

  if (config.supportingDocuments && config.supportingDocuments.length > 0) {
    return mergeSupportingDocs(mainPdf, config.supportingDocuments);
  }

  return mainPdf;
}

export async function mergeSupportingDocs(
  mainPdf: Buffer,
  docPaths: string[]
): Promise<Buffer> {
  const merged = await PDFDocument.create();

  // Copy main PDF pages
  const mainDoc = await PDFDocument.load(mainPdf);
  const mainPages = await merged.copyPages(mainDoc, mainDoc.getPageIndices());
  mainPages.forEach((page) => merged.addPage(page));

  // Lazy-import storage to avoid loading supabaseAdmin when not needed
  const { downloadFile } = await import('./storage');

  // Append each supporting document
  for (const docPath of docPaths) {
    let docBuffer: Buffer;
    try {
      docBuffer = await downloadFile(docPath);
    } catch (err) {
      console.warn(
        `Skipping supporting document ${docPath} (download failed): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      continue;
    }

    try {
      const supportDoc = await PDFDocument.load(docBuffer);
      const pages = await merged.copyPages(supportDoc, supportDoc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    } catch (err) {
      console.warn(
        `Skipping malformed/protected document ${docPath}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return Buffer.from(await merged.save());
}
