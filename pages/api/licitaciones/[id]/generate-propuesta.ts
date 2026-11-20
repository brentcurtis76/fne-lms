import { createHash } from 'node:crypto';
import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  getApiUser,
  getForcedPasswordChangeVerdict,
  sendForcedPasswordChangeResponse,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import { getUserRoles } from '@/utils/roleUtils';
import { uuidSchema } from '@/lib/validation/schemas';
import { uploadFile, fileExists } from '@/lib/propuestas/storage';
import { generateProposalPDFBuffer } from '@/lib/propuestas-web/pdf-generator';
import { validateProposalConfig, type ValidationConfig } from '@/lib/propuestas/validation';
import { generateAccessCode, hashAccessCode } from '@/lib/propuestas-web/access-code';
import { generateSlug } from '@/lib/propuestas-web/access-code';
import { buildProposalSnapshot, type BuildSnapshotInput } from '@/lib/propuestas-web/snapshot';
import { totalUf } from '@/lib/propuestas-web/pricing';

export const config = { maxDuration: 60 };

/** A generation still running this long after it started is treated as interrupted. */
const STALE_GENERATION_MS = 15 * 60_000;
const GENERATION_RUNNING_MESSAGE =
  'Ya hay una generación en curso para esta licitación. Espere a que finalice antes de generar una nueva propuesta.';
const ONE_RUNNING_INDEX = 'propuesta_generadas_one_running_per_licitacion';

/** True when a refusal names the one-running-generation exclusion constraint. */
function isOneRunningViolation(error: { message?: string; details?: string | null }): boolean {
  return `${error.message ?? ''} ${error.details ?? ''}`.includes(ONE_RUNNING_INDEX);
}

const GenerateSchema = z.object({
  plantilla_id: z.string().uuid(),
  config: z.object({
    type: z.enum(['evoluciona', 'preparacion']),
    schoolName: z.string().min(1),
    schoolLogoPath: z.string().optional(),
    programYear: z.number().int(),
    serviceName: z.string().min(1),
    consultants: z.array(
      z.object({
        nombre: z.string(),
        titulo: z.string(),
        bio: z.string(),
        fotoPath: z.string().optional(),
      })
    ),
    modules: z.array(
      z.object({
        nombre: z.string(),
        horas_presenciales: z.number().int().min(0),
        horas_sincronicas: z.number().int().min(0),
        horas_asincronicas: z.number().int().min(0),
        mes: z.number().int().optional(),
      })
    ),
    horasPresenciales: z.number().int().min(0),
    horasSincronicas: z.number().int().min(0),
    horasAsincronicas: z.number().int().min(0),
    pricing: z.object({
      mode: z.enum(['per_hour', 'fixed']),
      precioUf: z.number(),
      totalHours: z.number(),
      formaPago: z.string(),
      formaPagoDetalle: z.string().max(500).optional(),
      fixedUf: z.number().optional(),
    }),
    contentBlocks: z.array(
      z.object({
        key: z.string(),
        titulo: z.string(),
        contenido: z.record(z.unknown()),
        imagenes: z.array(z.unknown()).nullable().optional(),
      })
    ),
    supportingDocuments: z.array(z.string()).optional(),
    startMonth: z.number().int().optional(),
    duration: z.number().int().optional(),
    destinatarios: z.array(z.string()).optional(),
    buckets: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        hours: z.number().min(0),
        distributionType: z.enum(['bloque', 'cadencia', 'flexible']),
        modalidad: z.enum(['presencial', 'online', 'asincronico', 'hibrido']),
        isCustom: z.boolean().optional(),
        mes: z.number().int().min(1).max(12).optional(),
        notes: z.string().max(500).optional(),
      })
    ).optional().default([]),
  }),
  documentos_ids: z.array(z.string().uuid()).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'generate-propuesta');

  if (req.method !== 'POST') return handleMethodNotAllowed(res, ['POST']);

  const idParse = uuidSchema.safeParse(req.query.id);
  if (!idParse.success) return sendAuthError(res, 'ID de licitación inválido', 400);
  const licitacionId = idParse.data;

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  if (sendForcedPasswordChangeResponse(res, await getForcedPasswordChangeVerdict(serviceClient, user.id))) return;
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.some(role => role.role_type === 'admin' && role.is_active === true && !role.from_cache)) {
    return sendAuthError(res, 'Solo administradores pueden generar propuestas', 403);
  }

  const bodyParse = GenerateSchema.safeParse(req.body);
  if (!bodyParse.success) {
    const errors = bodyParse.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    return sendAuthError(res, `Datos inválidos: ${errors}`, 400);
  }

  const { plantilla_id, config: proposalConfig, documentos_ids } = bodyParse.data;

  // A proposal without a price is not generated (LIC-E6). The total is the ONE
  // price the panel, the PDF and the public page show, computed on the
  // proposal's own hours (never the client's pricing.totalHours), and refused
  // before anything is read or stored.
  const proposalHours =
    proposalConfig.horasPresenciales + proposalConfig.horasSincronicas + proposalConfig.horasAsincronicas;
  if (!(totalUf({ ...proposalConfig.pricing, totalHours: proposalHours }) > 0)) {
    return sendAuthError(res, 'Indique el precio de la propuesta', 400);
  }

  // Step 1: Validate licitacion exists (fetch extra fields for snapshot)
  const { data: licitacion, error: licError } = await serviceClient
    .from('licitaciones')
    .select('id, numero_licitacion, nombre_licitacion, year, cliente_id, school_id')
    .eq('id', licitacionId)
    .single();

  if (licError || !licitacion) {
    return sendAuthError(res, 'Licitación no encontrada', 404);
  }

  // Step 2: Load plantilla + ficha
  const { data: plantilla, error: plantillaError } = await serviceClient
    .from('propuesta_plantillas')
    .select('*, ficha:propuesta_fichas_servicio(*)')
    .eq('id', plantilla_id)
    .eq('activo', true)
    .single();

  if (plantillaError || !plantilla) {
    return sendAuthError(res, 'Plantilla no encontrada', 404);
  }

  // Step 3: Load selected documents for expiry check + snapshot
  let selectedDocuments: Array<{ id: string; nombre: string; tipo: string; descripcion: string | null; fecha_vencimiento: string | null; archivo_path: string | null }> =
    [];
  if (documentos_ids && documentos_ids.length > 0) {
    const { data: docs, error: docsError } = await serviceClient
      .from('propuesta_documentos_biblioteca')
      .select('id, nombre, tipo, descripcion, fecha_vencimiento, archivo_path')
      .eq('activo', true)
      .in('id', documentos_ids);

    if (docsError) {
      return sendAuthError(res, 'Error al cargar documentos', 500, docsError.message);
    }
    selectedDocuments = docs ?? [];
  }

  // Step 4: Run MINEDUC validation
  const ficha = plantilla.ficha as Record<string, unknown> | null;
  if (!ficha) {
    return sendAuthError(res, 'La plantilla no tiene una Ficha de Servicio asociada', 422);
  }

  const validationConfig: ValidationConfig = {
    nombre_servicio: proposalConfig.serviceName,
    horas_presenciales: proposalConfig.horasPresenciales,
    horas_sincronicas: proposalConfig.horasSincronicas,
    horas_asincronicas: proposalConfig.horasAsincronicas,
    consultores: proposalConfig.consultants as Array<{ nombre: string }>,
    total_hours:
      proposalConfig.horasPresenciales +
      proposalConfig.horasSincronicas +
      proposalConfig.horasAsincronicas,
    modules: proposalConfig.modules as Array<{
      horas_presenciales: number;
      horas_sincronicas: number;
      horas_asincronicas: number;
    }>,
    destinatarios: proposalConfig.destinatarios,
  };

  const validation = validateProposalConfig(
    validationConfig,
    ficha as unknown as Parameters<typeof validateProposalConfig>[1],
    selectedDocuments
  );

  if (!validation.valid) {
    return sendAuthError(
      res,
      'La propuesta no cumple con los requisitos MINEDUC',
      400,
      JSON.stringify({ errors: validation.errors, warnings: validation.warnings })
    );
  }

  // Step 4a: Verify every selected document's file actually exists in storage.
  // The snapshot freezes these paths, so a missing file would otherwise be
  // captured as a dead path and silently dropped from the proposal and ZIP.
  // Fail loudly here instead, naming the offending documents so the admin can
  // fix the library before generating.
  if (selectedDocuments.length > 0) {
    const missingDocs: string[] = [];
    for (const doc of selectedDocuments) {
      if (!(await fileExists(doc.archivo_path))) {
        missingDocs.push(doc.nombre);
      }
    }
    if (missingDocs.length > 0) {
      return sendAuthError(
        res,
        `Los siguientes documentos seleccionados no tienen un archivo disponible en el almacenamiento y deben corregirse antes de generar la propuesta: ${missingDocs.join(', ')}. Vuelva a subirlos en la biblioteca de documentos.`,
        422
      );
    }
  }

  // Step 4b: Guard against concurrent generation for the same licitacion.
  // A generation still «generando» STALE_GENERATION_MS after it started
  // (created_at) was interrupted: mark it failed and let the new one start.
  // "One running generation per tender" is a fact of the database (exclusion
  // constraint propuesta_generadas_one_running_per_licitacion): the stale row
  // is marked failed only if it is still running and still old enough, and the
  // insert below is what decides who starts — a request that lost the race gets
  // the constraint's refusal, whatever its own update changed.
  const { data: runningRows } = await serviceClient
    .from('propuesta_generadas')
    .select('id, created_at')
    .eq('licitacion_id', licitacionId)
    .eq('estado', 'generando');

  const now = Date.now();
  const staleBefore = new Date(now - STALE_GENERATION_MS).toISOString();
  for (const running of (runningRows ?? []) as Array<{ id: string; created_at: string | null }>) {
    const startedAt = running.created_at ? Date.parse(running.created_at) : NaN;
    const age = now - startedAt;
    if (Number.isFinite(age) && age >= STALE_GENERATION_MS) {
      await serviceClient
        .from('propuesta_generadas')
        .update({ estado: 'error', error_message: 'Generación interrumpida' })
        .eq('id', running.id)
        .eq('estado', 'generando')
        .lt('created_at', staleBefore);
      continue;
    }
    const minutesLeft = Number.isFinite(age)
      ? Math.max(1, Math.ceil((STALE_GENERATION_MS - age) / 60_000))
      : Math.ceil(STALE_GENERATION_MS / 60_000);
    return sendAuthError(
      res,
      `${GENERATION_RUNNING_MESSAGE} Podrá intentarlo de nuevo en ${minutesLeft} ${minutesLeft === 1 ? 'minuto' : 'minutos'}.`,
      409
    );
  }

  // Step 5: Determine version number
  const { data: maxVersionRow } = await serviceClient
    .from('propuesta_generadas')
    .select('version')
    .eq('licitacion_id', licitacionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = (maxVersionRow?.version ?? 0) + 1;

  // Step 6: Create propuesta_generada record with estado='generando'
  const { data: propuesta, error: insertError } = await serviceClient
    .from('propuesta_generadas')
    .insert({
      licitacion_id: licitacionId,
      plantilla_id,
      ficha_id: plantilla.ficha_id ?? null,
      configuracion: {
        horas: validationConfig.total_hours,
        desglose: {
          presenciales: proposalConfig.horasPresenciales,
          sincronicas: proposalConfig.horasSincronicas,
          asincronicas: proposalConfig.horasAsincronicas,
        },
        consultores_ids: [],
        precio_uf: proposalConfig.pricing.precioUf,
        precio_modelo: proposalConfig.pricing.mode,
        forma_pago: proposalConfig.pricing.formaPago,
        plataforma: false,
        modulos: proposalConfig.modules,
      },
      documentos_ids: documentos_ids ?? null,
      estado: 'generando',
      version,
      generado_por: user.id,
    })
    .select('id')
    .single();

  if (insertError || !propuesta) {
    // The one-running-generation exclusion constraint refuses a second running
    // row for this tender with an exclusion violation (23P01): another request
    // started a generation first, nothing is started here.
    if (insertError?.code === '23P01' && isOneRunningViolation(insertError)) {
      return sendAuthError(res, GENERATION_RUNNING_MESSAGE, 409);
    }
    if (insertError?.code === '23505') {
      // Another request started a generation first: nothing is started here.
      // The same version may be refused first by unique_version_per_licitacion;
      // then a running row of that other request says the same thing.
      let running = isOneRunningViolation(insertError);
      if (!running) {
        const { data: runningNow } = await serviceClient
          .from('propuesta_generadas')
          .select('id')
          .eq('licitacion_id', licitacionId)
          .eq('estado', 'generando');
        running = (runningNow ?? []).length > 0;
      }
      if (running) return sendAuthError(res, GENERATION_RUNNING_MESSAGE, 409);
    }
    if (insertError?.code === '23505') {
      return sendAuthError(
        res,
        'Conflicto de versión: otra generación se completó simultáneamente. Intente nuevamente.',
        409
      );
    }
    return sendAuthError(res, 'Error al crear registro de propuesta', 500, insertError?.message);
  }

  const propuestaId = propuesta.id;

  // Steps 7-11: Build snapshot, render PDF from it, hash, upload, finalize.
  try {
    // Step 7: Generate web view access data
    const accessCodePlain = generateAccessCode();
    const accessCodeHash = await hashAccessCode(accessCodePlain);
    const webSlug = generateSlug(
      proposalConfig.schoolName,
      proposalConfig.type,
      proposalConfig.programYear,
      version,
      propuestaId
    );

    // Step 8: Fetch enrichment records and build the snapshot. The snapshot is
    // the single source of truth for the proposal PDF (rendered in Step 9).
    const consultantNames = proposalConfig.consultants.map((c: { nombre: string }) => c.nombre);
    const [{ data: consultantRecords }, { data: clienteData }, { data: schoolData }] = await Promise.all([
      serviceClient
        .from('propuesta_consultores')
        .select('nombre, categoria, foto_path, cv_pdf_path, formacion_academica, experiencia_profesional, especialidades')
        .in('nombre', consultantNames)
        .eq('activo', true),
      licitacion.cliente_id
        ? serviceClient
            .from('clientes')
            .select('nombre_legal, nombre_fantasia, comuna, ciudad, nombre_representante')
            .eq('id', licitacion.cliente_id)
            .single()
        : Promise.resolve({ data: null }),
      licitacion.school_id
        ? serviceClient
            .from('schools')
            .select('code')
            .eq('id', licitacion.school_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    const fichaForSnapshot = ficha as {
      id: string;
      folio: number;
      nombre_servicio: string;
      dimension: string;
      categoria: string;
      total_horas: number;
      destinatarios: string[];
      objetivo_general?: string | null;
    } | null;

    const snapshotJson = buildProposalSnapshot({
      config: proposalConfig as BuildSnapshotInput['config'],
      version,
      consultantRecords: consultantRecords ?? [],
      selectedDocuments,
      licitacion,
      ficha: fichaForSnapshot,
      cliente: clienteData as BuildSnapshotInput['cliente'],
      schoolCode: (schoolData as { code?: string } | null)?.code ?? null,
    });

    // Step 9: Render the canonical PDF from the snapshot — the SAME generator
    // the public page's "Descargar PDF" button uses — so the stored PDF, the
    // page download and the ZIP bundle all produce an identical document.
    const pdfBuffer = generateProposalPDFBuffer(snapshotJson);

    // Step 10: Compute SHA-256 and upload to storage
    const sha256 = createHash('sha256').update(pdfBuffer).digest('hex');
    const storagePath = `generadas/${licitacionId}/${propuestaId}.pdf`;
    await uploadFile(storagePath, pdfBuffer, 'application/pdf');

    // Step 11: Update record to completada with web data
    const { error: updateError } = await serviceClient
      .from('propuesta_generadas')
      .update({
        estado: 'completada',
        archivo_path: storagePath,
        pdf_sha256: sha256,
        access_code: accessCodeHash,
        access_code_plain: accessCodePlain,
        web_slug: webSlug,
        web_status: 'published',
        snapshot_json: snapshotJson,
      })
      .eq('id', propuestaId);

    if (updateError) throw new Error(updateError.message);

    // Step 12: the new version is published, so the older live links of this
    // tender stop working (LIC-E2, Brent 20 Nov 2026). A failure here does not
    // undo the new version: it is logged and the answer says null, so the
    // admin retires the older links by hand («Retirar enlace»).
    let enlacesAnterioresRetirados: number | null = null;
    try {
      const { data: retiredRows, error: retireError } = await serviceClient
        .from('propuesta_generadas')
        .update({ web_status: 'expired' })
        .eq('licitacion_id', licitacionId)
        .neq('id', propuestaId)
        // Only OLDER versions: a newer one published meanwhile stays live.
        .lt('version', version)
        .in('web_status', ['published', 'viewed'])
        .select('id');
      if (retireError) {
        console.error('[generate-propuesta] Could not retire the older links:', retireError.message);
      } else {
        enlacesAnterioresRetirados = (retiredRows ?? []).length;
      }
    } catch (retireErr) {
      console.error('[generate-propuesta] Could not retire the older links:', retireErr);
    }

    return sendApiResponse(res, {
      propuesta_id: propuestaId,
      estado: 'completada',
      archivo_path: storagePath,
      version,
      validation_warnings: validation.warnings,
      web_slug: webSlug,
      access_code: accessCodePlain,
      enlaces_anteriores_retirados: enlacesAnterioresRetirados,
    });
  } catch (err) {
    // Step 11: Mark as error
    const errorMessage = err instanceof Error ? err.message : 'Error al generar PDF';
    await serviceClient
      .from('propuesta_generadas')
      .update({ estado: 'error', error_message: errorMessage })
      .eq('id', propuestaId);

    return sendAuthError(res, 'Error al generar propuesta', 500, errorMessage);
  }
}
