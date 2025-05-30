-- Create expense reports tables for Rendición de Gastos

-- Create expense categories table
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#6B7280', -- Hex color for UI
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create expense reports table
CREATE TABLE IF NOT EXISTS expense_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_name VARCHAR(200) NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  total_amount DECIMAL(12,2) DEFAULT 0,
  submitted_by UUID REFERENCES profiles(id) ON DELETE CASCADE,
  submitted_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create expense items table
CREATE TABLE IF NOT EXISTS expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES expense_reports(id) ON DELETE CASCADE,
  category_id UUID REFERENCES expense_categories(id) ON DELETE RESTRICT,
  description VARCHAR(300) NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL,
  vendor VARCHAR(200),
  receipt_url TEXT,
  receipt_filename VARCHAR(300),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default expense categories
INSERT INTO expense_categories (name, description, color) VALUES
  ('Transporte', 'Gastos de transporte y movilización', '#3B82F6'),
  ('Alimentación', 'Comidas y alimentación durante trabajo', '#10B981'),
  ('Materiales', 'Materiales de oficina y suministros', '#8B5CF6'),
  ('Tecnología', 'Equipos tecnológicos y software', '#F59E0B'),
  ('Capacitación', 'Cursos y material de capacitación', '#EF4444'),
  ('Servicios', 'Servicios profesionales externos', '#6366F1'),
  ('Hospedaje', 'Alojamiento y estadía', '#EC4899'),
  ('Comunicaciones', 'Teléfono, internet, correo', '#14B8A6'),
  ('Otros', 'Gastos varios no categorizados', '#6B7280')
ON CONFLICT DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_expense_reports_submitted_by ON expense_reports(submitted_by);
CREATE INDEX IF NOT EXISTS idx_expense_reports_status ON expense_reports(status);
CREATE INDEX IF NOT EXISTS idx_expense_reports_dates ON expense_reports(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_expense_items_report_id ON expense_items(report_id);
CREATE INDEX IF NOT EXISTS idx_expense_items_category_id ON expense_items(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_items_date ON expense_items(expense_date);

-- Enable RLS
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Categories: Everyone can read, only admins can modify
CREATE POLICY "expense_categories_read" ON expense_categories
  FOR SELECT USING (TRUE);

CREATE POLICY "expense_categories_admin_only" ON expense_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Reports: Users can see their own reports, admins can see all
CREATE POLICY "expense_reports_own" ON expense_reports
  FOR ALL USING (
    submitted_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Items: Users can manage items in their own reports, admins can manage all
CREATE POLICY "expense_items_own_reports" ON expense_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM expense_reports 
      WHERE id = expense_items.report_id 
      AND (submitted_by = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role = 'admin'
      ))
    )
  );

-- Note: Storage bucket policies for boletas are now managed separately
-- Run scripts/apply-boletas-policies.js to configure proper RLS policies
-- for admin-only access to receipt uploads

-- Add comments for documentation
COMMENT ON TABLE expense_categories IS 'Categories for organizing expense items';
COMMENT ON TABLE expense_reports IS 'Main expense reports submitted by users';
COMMENT ON TABLE expense_items IS 'Individual expense items within reports';
COMMENT ON COLUMN expense_reports.status IS 'Report status: draft, submitted, approved, rejected';
COMMENT ON COLUMN expense_items.receipt_url IS 'URL to uploaded receipt file in boletas bucket';