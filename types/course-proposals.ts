export interface CourseProposal {
  id: string;
  titulo: string;
  descripcion_corta: string;
  competencias_desarrollar: string;
  tiempo_requerido_desarrollo: string;
  necesita_ayuda_diseno_instruccional: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: 'pending' | 'reviewed' | 'approved' | 'rejected';
  creator?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface CreateCourseProposalInput {
  titulo: string;
  descripcion_corta: string;
  competencias_desarrollar: string;
  tiempo_requerido_desarrollo: string;
  necesita_ayuda_diseno_instruccional: boolean;
}

export interface CourseProposalApiResponse {
  success: boolean;
  data?: CourseProposal | CourseProposal[];
  error?: string;
}
