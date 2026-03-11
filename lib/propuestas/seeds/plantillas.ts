import type { PropuestaPlantillaInsert } from '@/lib/propuestas/types';

/**
 * Seed data for propuesta_plantillas
 * Proposal templates for each program type.
 *
 * Note: ficha_id is null here — it must be resolved at seed-script run time
 * by looking up the UUID of the corresponding ficha by folio number.
 * See comments on each entry for the target ficha folio.
 */
export const PLANTILLAS_SEED: PropuestaPlantillaInsert[] = [
  {
    nombre: 'Programa Evoluciona 148h',
    tipo_servicio: 'evoluciona',
    // ficha_id resolved at seed time from folio 52244
    ficha_id: null,
    bloques_orden: [
      'educacion_relacional',
      'modelo_consultoria_fases',
      'modelo_consultoria_elementos',
      'generacion_tractor',
      'proyecto_innova',
      'liderazgo_cambio',
      'acompanamiento_tecnico',
      'comunidades_crecimiento',
      'inspira_estadias',
      'plataforma_crecimiento',
    ],
    horas_default: 148,
    configuracion_default: {
      horas_presenciales: 80,
      horas_sincronicas: 44,
      horas_asincronicas: 24,
      plataforma: true,
      precio_modelo: 'per_hour',
      precio_uf: 1.2,
      forma_pago: '3 cuotas iguales',
    },
    activo: true,
  },
  {
    nombre: 'Programa Preparación 88h',
    tipo_servicio: 'preparacion',
    // ficha_id resolved at seed time from folio 46064
    ficha_id: null,
    bloques_orden: [
      'educacion_relacional',
      'modelo_consultoria_fases',
      'modelo_consultoria_elementos',
      'generacion_tractor',
      'proyecto_innova',
      'liderazgo_cambio',
    ],
    horas_default: 88,
    configuracion_default: {
      horas_presenciales: 56,
      horas_sincronicas: 32,
      horas_asincronicas: 0,
      plataforma: false,
      precio_modelo: 'per_hour',
      precio_uf: 1.2,
      forma_pago: '2 cuotas',
    },
    activo: true,
  },
];
