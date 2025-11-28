import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import Anthropic from '@anthropic-ai/sdk';
import pdfParse from 'pdf-parse';

// Types for extracted data
interface ExtractedContract {
  contract: {
    numero_contrato: string;
    fecha_contrato: string;
    fecha_fin?: string;
    confidence: number;
    auto_generated_number?: boolean;
  };
  client: {
    nombre_legal: string;
    rut: string;
    direccion?: string;
    comuna?: string;
    ciudad?: string;
    nombre_representante?: string;
    rut_representante?: string;
    confidence: number;
  };
  financial: {
    precio_total: number;
    moneda: 'UF' | 'CLP';
    confidence: number;
  };
  payment_schedule?: Array<{
    numero_cuota: number;
    fecha_vencimiento: string;
    monto: number;
    confidence: number;
  }>;
  overall_confidence: number;
}

// Helper to validate Chilean RUT
function validateRUT(rut: string): boolean {
  // Remove dots and hyphen
  const cleanRut = rut.replace(/\./g, '').replace(/-/g, '');
  if (cleanRut.length < 2) return false;
  
  const body = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1).toUpperCase();
  
  // Calculate verification digit
  let sum = 0;
  let multiplier = 2;
  
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  
  const expectedDV = 11 - (sum % 11);
  const calculatedDV = expectedDV === 11 ? '0' : expectedDV === 10 ? 'K' : expectedDV.toString();
  
  return dv === calculatedDV;
}

// Helper to calculate overall confidence
function calculateOverallConfidence(data: any): number {
  const confidences = [];
  
  if (data.contract?.confidence) confidences.push(data.contract.confidence);
  if (data.client?.confidence) confidences.push(data.client.confidence);
  if (data.financial?.confidence) confidences.push(data.financial.confidence);
  
  if (data.payment_schedule && Array.isArray(data.payment_schedule)) {
    data.payment_schedule.forEach((payment: any) => {
      if (payment.confidence) confidences.push(payment.confidence);
    });
  }
  
  if (confidences.length === 0) return 0;
  return confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
}

// Main extraction function
async function extractContractFromPDF(text: string, anthropic: Anthropic): Promise<ExtractedContract> {
  const prompt = `
You are an expert at extracting structured data from Chilean legal contracts.
Analyze this contract text and extract the information requested below.
IMPORTANT: Look very carefully for the legal representative's RUT/Cédula. It may appear:
- After the representative's name (e.g., "representado por [name], RUT...")
- In a separate line after the name
- With formats like "RUT:", "Cédula:", "C.I.:", or "cédula nacional de identidad"
- Sometimes written as "cédula de identidad N°" or similar variations
Extract ALL RUT numbers you find - both for the company and the representative.
Provide confidence scores (0-1) for each section based on how clearly the information appears in the text.

CONTRACT TEXT:
${text}

Please extract and return a JSON object with this exact structure:
{
  "contract": {
    "numero_contrato": "Contract number or identifier",
    "fecha_contrato": "YYYY-MM-DD format",
    "fecha_fin": "YYYY-MM-DD format or null if not specified",
    "confidence": 0.0 to 1.0
  },
  "client": {
    "nombre_legal": "Legal company name",
    "rut": "Chilean RUT with format XX.XXX.XXX-X",
    "direccion": "Street address",
    "comuna": "Comuna/District",
    "ciudad": "City",
    "nombre_representante": "Legal representative name",
    "rut_representante": "Representative's RUT",
    "confidence": 0.0 to 1.0
  },
  "financial": {
    "precio_total": numeric value,
    "moneda": "UF" or "CLP",
    "confidence": 0.0 to 1.0
  },
  "payment_schedule": [
    {
      "numero_cuota": payment number,
      "fecha_vencimiento": "YYYY-MM-DD",
      "monto": numeric amount,
      "confidence": 0.0 to 1.0
    }
  ]
}

Important extraction rules:
1. Look for "CONTRATO", "CONVENIO", or similar headers for contract number
2. Search for "RUT", "R.U.T", or "Rol Único Tributario" for tax IDs
3. Payment terms might be listed as "cuotas", "pagos", "vencimientos", or in a table
4. Dates should be converted to ISO format (YYYY-MM-DD)
5. For UF amounts, look for "UF" or "Unidades de Fomento"
6. Extract ALL payment installments if a schedule exists
7. Set confidence based on:
   - 1.0: Information is explicitly stated
   - 0.7-0.9: Information can be inferred with high certainty
   - 0.4-0.6: Information requires some interpretation
   - Below 0.4: Information is unclear or missing

Return ONLY valid JSON, no additional text or explanation.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5-20251101",
      max_tokens: 4000,
      temperature: 0, // Deterministic for consistent extraction
      system: "You are a contract analysis expert specializing in Chilean legal documents. Extract data accurately and provide confidence scores. Always return valid JSON.",
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    // Extract JSON from response
    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    
    // Try to parse the JSON response
    let extractedData;
    try {
      // Clean up the response if needed (remove markdown code blocks if present)
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extractedData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      throw new Error('Invalid JSON response from AI');
    }

    // Add overall confidence
    extractedData.overall_confidence = calculateOverallConfidence(extractedData);

    return extractedData as ExtractedContract;
  } catch (error: any) {
    console.error('Error calling Claude API:', error);
    // Provide more specific error messages
    if (error?.status === 401) {
      throw new Error('API key inválida o expirada');
    } else if (error?.status === 429) {
      throw new Error('Límite de API excedido - intente más tarde');
    } else if (error?.message) {
      throw new Error(`Error de API: ${error.message}`);
    }
    throw new Error('Failed to extract contract data');
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
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

    // Check if user is admin
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .single();

    if (!userRoles) {
      return res.status(403).json({ error: 'Acceso denegado - Se requiere rol de administrador' });
    }

    // Get PDF data from request (support both pdfBase64 and pdfData for compatibility)
    const { pdfBase64, pdfData, pdfUrl, fileName } = req.body;
    const pdfContent = pdfBase64 || pdfData;

    if (!pdfContent && !pdfUrl) {
      return res.status(400).json({ error: 'Se requiere pdfBase64 o pdfUrl' });
    }

    // Check if API key is configured
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-anthropic-api-key-here') {
      return res.status(500).json({ 
        error: 'API de Claude no configurada',
        details: 'Por favor, configure ANTHROPIC_API_KEY en el archivo .env.local'
      });
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Get PDF buffer
    let buffer: Buffer;
    if (pdfUrl) {
      // Fetch PDF from URL (e.g., from Supabase Storage)
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch PDF from URL');
      }
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      // Decode base64 PDF data
      buffer = Buffer.from(pdfContent, 'base64');
    }

    // Extract text from PDF
    const pdfText = await pdfParse(buffer);
    
    if (!pdfText.text || pdfText.text.trim().length === 0) {
      return res.status(400).json({ 
        error: 'No se pudo extraer texto del PDF',
        details: 'El archivo puede estar vacío o ser una imagen escaneada sin OCR'
      });
    }

    // Extract contract data using Claude
    const extractedData = await extractContractFromPDF(pdfText.text, anthropic);

    // Generate contract number if not found or empty
    if (!extractedData.contract.numero_contrato || extractedData.contract.numero_contrato === '-') {
      const currentYear = new Date().getFullYear();
      const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
      
      // Get count of contracts this month for sequential numbering
      const { count } = await supabase
        .from('contratos')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${currentYear}-${currentMonth}-01`);
      
      const sequentialNumber = String((count || 0) + 1).padStart(3, '0');
      extractedData.contract.numero_contrato = `FNE-${currentYear}-${currentMonth}-${sequentialNumber}`;
      
      // Add note that number was auto-generated
      extractedData.contract.auto_generated_number = true;
    }

    // Validate extracted data
    const validationErrors = [];
    
    // Validate RUT if extracted
    if (extractedData.client.rut && !validateRUT(extractedData.client.rut)) {
      validationErrors.push({
        field: 'client.rut',
        message: 'RUT inválido - verificar formato',
        value: extractedData.client.rut
      });
    }

    // Validate representative's RUT if extracted
    if (extractedData.client.rut_representante && !validateRUT(extractedData.client.rut_representante)) {
      validationErrors.push({
        field: 'client.rut_representante',
        message: 'RUT del representante inválido - verificar formato',
        value: extractedData.client.rut_representante
      });
    }

    // Validate dates
    if (extractedData.contract.fecha_fin) {
      const startDate = new Date(extractedData.contract.fecha_contrato);
      const endDate = new Date(extractedData.contract.fecha_fin);
      if (endDate <= startDate) {
        validationErrors.push({
          field: 'contract.fecha_fin',
          message: 'La fecha de fin debe ser posterior a la fecha de inicio'
        });
      }
    }

    // Validate payment schedule totals if present
    if (extractedData.payment_schedule && extractedData.payment_schedule.length > 0) {
      const totalPayments = extractedData.payment_schedule.reduce(
        (sum, payment) => sum + payment.monto, 
        0
      );
      
      const difference = Math.abs(totalPayments - extractedData.financial.precio_total);
      if (difference > 0.01) { // Allow small rounding differences
        validationErrors.push({
          field: 'payment_schedule',
          message: `La suma de las cuotas (${totalPayments}) no coincide con el total (${extractedData.financial.precio_total})`
        });
      }
    }

    // Check for existing client by RUT
    let existingClient = null;
    if (extractedData.client.rut) {
      const { data: clientData } = await supabase
        .from('clientes')
        .select('*')
        .eq('rut', extractedData.client.rut)
        .single();
      
      existingClient = clientData;
    }

    // Return the extracted data with validation results
    res.status(200).json({
      success: true,
      extracted: extractedData,
      existingClient,
      validationErrors,
      pdfInfo: {
        pages: pdfText.numpages,
        textLength: pdfText.text.length
      },
      requiresReview: extractedData.overall_confidence < 0.7 || validationErrors.length > 0
    });

  } catch (error) {
    console.error('Error in PDF extraction endpoint:', error);

    // Return appropriate error message
    if (error instanceof Error) {
      if (error.message.includes('API key') || error.message.includes('401')) {
        return res.status(500).json({
          error: 'Error de configuración',
          details: error.message
        });
      }
      if (error.message.includes('429') || error.message.includes('rate')) {
        return res.status(500).json({
          error: 'Límite de API excedido',
          details: 'Por favor espere unos minutos e intente nuevamente'
        });
      }
      if (error.message.includes('Failed to extract') || error.message.includes('Error de API')) {
        return res.status(500).json({
          error: 'Error al extraer datos del contrato',
          details: error.message || 'El AI no pudo procesar el documento correctamente'
        });
      }
    }

    return res.status(500).json({
      error: 'Error al procesar el PDF',
      details: error instanceof Error ? error.message : 'Por favor, intente nuevamente o ingrese los datos manualmente'
    });
  }
}