import { createHash } from 'node:crypto';
import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import { getUserRoles } from '@/utils/roleUtils';
import { uuidSchema } from '@/lib/validation/schemas';
import { generateProposal } from '@/lib/propuestas/generator';
import { uploadFile } from '@/lib/propuestas/storage';
import { validateProposalConfig, type ValidationConfig } from '@/lib/propuestas/validation';

export const config = { maxDuration: 60 };

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
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
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

  // Step 1: Validate licitacion exists
  const { data: licitacion, error: licError } = await serviceClient
    .from('licitaciones')
    .select('id')
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
    .single();

  if (plantillaError || !plantilla) {
    return sendAuthError(res, 'Plantilla no encontrada', 404);
  }

  // Step 3: Load selected documents for expiry check
  let selectedDocuments: Array<{ id: string; nombre: string; fecha_vencimiento: string | null }> =
    [];
  if (documentos_ids && documentos_ids.length > 0) {
    const { data: docs, error: docsError } = await serviceClient
      .from('propuesta_documentos_biblioteca')
      .select('id, nombre, fecha_vencimiento')
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
    return sendAuthError(res, 'Error al crear registro de propuesta', 500, insertError?.message);
  }

  const propuestaId = propuesta.id;

  // Steps 7-10: Generate PDF, hash, upload, update record
  try {
    // Step 7: Generate PDF
    const pdfBuffer = await generateProposal(proposalConfig as Parameters<typeof generateProposal>[0]);

    // Step 8: Compute SHA-256
    const sha256 = createHash('sha256').update(pdfBuffer).digest('hex');

    // Step 9: Upload to storage
    const storagePath = `generadas/${licitacionId}/${propuestaId}.pdf`;
    await uploadFile(storagePath, pdfBuffer, 'application/pdf');

    // Step 10: Update record to completada
    const { error: updateError } = await serviceClient
      .from('propuesta_generadas')
      .update({
        estado: 'completada',
        archivo_path: storagePath,
        pdf_sha256: sha256,
      })
      .eq('id', propuestaId);

    if (updateError) throw new Error(updateError.message);

    return sendApiResponse(res, {
      propuesta_id: propuestaId,
      estado: 'completada',
      archivo_path: storagePath,
      version,
      validation_warnings: validation.warnings,
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
