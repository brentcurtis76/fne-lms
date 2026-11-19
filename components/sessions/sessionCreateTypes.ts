/**
 * The shapes the admin's «create session» form works with (`pages/admin/sessions/create.tsx`).
 * Moved out of the page unchanged (redesign 6, release SA); only `export` is added.
 */
export interface School {
  id: number;
  name: string;
}

export interface GrowthCommunity {
  id: string;
  name: string;
  school_id: number;
}

export interface Consultant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface Facilitator {
  user_id: string;
  facilitator_role: 'consultor_externo' | 'equipo_interno';
  is_lead: boolean;
}

export interface HourType {
  id: string;
  key: string;
  display_name: string;
  modality: string;
  sort_order: number;
}

export interface Contrato {
  id: string;
  nombre: string;
}
