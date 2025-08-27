import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

// Mock data for testing without API key - Updated for Monte Carmelo/Evoluciona style
const MOCK_EXTRACTION = {
  contract: {
    numero_contrato: "FNE-2025-MC-066",
    fecha_contrato: "2025-01-15",
    fecha_fin: "2025-12-20",
    confidence: 0.95
  },
  client: {
    nombre_legal: "Colegio Monte Carmelo",
    rut: "65.123.456-7",
    direccion: "Av. Principal 567",
    comuna: "Las Condes",
    ciudad: "Santiago",
    nombre_representante: "María González Directora",
    confidence: 0.88
  },
  financial: {
    precio_total: 66, // 66 horas
    moneda: "UF" as const,
    confidence: 0.92
  },
  payment_schedule: [
    {
      numero_cuota: 1,
      fecha_vencimiento: "2025-04-30",
      monto: 22,
      confidence: 0.90
    },
    {
      numero_cuota: 2,
      fecha_vencimiento: "2025-08-30",
      monto: 22,
      confidence: 0.90
    },
    {
      numero_cuota: 3,
      fecha_vencimiento: "2025-11-30",
      monto: 22,
      confidence: 0.90
    }
  ],
  overall_confidence: 0.91
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create Supabase client
    const supabase = createPagesServerClient({ req, res });
    
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Return mock extracted data
    res.status(200).json({
      success: true,
      extracted: MOCK_EXTRACTION,
      existingClient: null,
      validationErrors: [],
      pdfInfo: {
        pages: 5,
        textLength: 12000
      },
      requiresReview: false,
      isMockData: true,
      message: "Datos de prueba - Configure ANTHROPIC_API_KEY para extracción real"
    });

  } catch (error) {
    console.error('Error in mock PDF extraction:', error);
    return res.status(500).json({ 
      error: 'Error al procesar el PDF',
      details: 'Mock mode error'
    });
  }
}