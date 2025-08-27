-- Add PDF extraction tracking fields to contratos table
-- This allows us to track AI-extracted contract data and confidence scores

-- Add extraction tracking fields
ALTER TABLE contratos 
ADD COLUMN IF NOT EXISTS pdf_extracted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS extraction_data JSONB,
ADD COLUMN IF NOT EXISTS extraction_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS extraction_timestamp TIMESTAMP WITH TIME ZONE;

-- Add comments for documentation
COMMENT ON COLUMN contratos.pdf_extracted IS 'Indicates if contract data was extracted from a PDF using AI';
COMMENT ON COLUMN contratos.extraction_data IS 'JSON data containing the raw extraction results from AI processing';
COMMENT ON COLUMN contratos.extraction_confidence IS 'Overall confidence score (0-1) of the AI extraction';
COMMENT ON COLUMN contratos.extraction_timestamp IS 'When the PDF extraction was performed';

-- Create table to store extraction feedback for continuous improvement
CREATE TABLE IF NOT EXISTS contract_extraction_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES contratos(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  extracted_value TEXT,
  corrected_value TEXT,
  confidence DECIMAL(3,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_contratos_pdf_extracted ON contratos(pdf_extracted);
CREATE INDEX IF NOT EXISTS idx_extraction_feedback_contract ON contract_extraction_feedback(contract_id);

-- Grant permissions
GRANT ALL ON contract_extraction_feedback TO authenticated;

-- Add RLS policies
ALTER TABLE contract_extraction_feedback ENABLE ROW LEVEL SECURITY;

-- Admin can manage all feedback
CREATE POLICY "Admin can manage extraction feedback"
  ON contract_extraction_feedback
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  );