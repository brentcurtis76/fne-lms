-- Migration: Create Lighthouse Results and Web Vitals Tables
-- Created: 2026-01-16
-- Purpose: Track performance audits and Core Web Vitals metrics

-- ============================================
-- Lighthouse Results Table
-- ============================================
CREATE TABLE IF NOT EXISTS qa_lighthouse_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  performance_score INTEGER CHECK (performance_score >= 0 AND performance_score <= 100),
  accessibility_score INTEGER CHECK (accessibility_score >= 0 AND accessibility_score <= 100),
  best_practices_score INTEGER CHECK (best_practices_score >= 0 AND best_practices_score <= 100),
  seo_score INTEGER CHECK (seo_score >= 0 AND seo_score <= 100),
  report_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Add comments for documentation
COMMENT ON TABLE qa_lighthouse_results IS 'Stores Lighthouse audit results for performance tracking';
COMMENT ON COLUMN qa_lighthouse_results.url IS 'The URL that was audited';
COMMENT ON COLUMN qa_lighthouse_results.performance_score IS 'Performance score (0-100)';
COMMENT ON COLUMN qa_lighthouse_results.accessibility_score IS 'Accessibility score (0-100)';
COMMENT ON COLUMN qa_lighthouse_results.best_practices_score IS 'Best practices score (0-100)';
COMMENT ON COLUMN qa_lighthouse_results.seo_score IS 'SEO score (0-100)';
COMMENT ON COLUMN qa_lighthouse_results.report_json IS 'Full Lighthouse report in JSON format';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_lighthouse_url ON qa_lighthouse_results(url);
CREATE INDEX IF NOT EXISTS idx_lighthouse_created ON qa_lighthouse_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lighthouse_performance ON qa_lighthouse_results(performance_score);

-- ============================================
-- Web Vitals Table
-- ============================================
CREATE TABLE IF NOT EXISTS qa_web_vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_url TEXT NOT NULL,
  vital_name TEXT NOT NULL CHECK (vital_name IN ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  value DECIMAL NOT NULL,
  rating TEXT CHECK (rating IN ('good', 'needs-improvement', 'poor')),
  user_agent TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE qa_web_vitals IS 'Tracks Core Web Vitals metrics from real user monitoring';
COMMENT ON COLUMN qa_web_vitals.page_url IS 'The page URL where the vital was measured';
COMMENT ON COLUMN qa_web_vitals.vital_name IS 'The type of vital: LCP, INP, CLS, FCP, or TTFB';
COMMENT ON COLUMN qa_web_vitals.value IS 'The measured value (ms for time-based, decimal for CLS)';
COMMENT ON COLUMN qa_web_vitals.rating IS 'Performance rating: good, needs-improvement, or poor';
COMMENT ON COLUMN qa_web_vitals.user_agent IS 'Browser user agent string for debugging';
COMMENT ON COLUMN qa_web_vitals.session_id IS 'Optional session identifier for grouping metrics';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vitals_page ON qa_web_vitals(page_url);
CREATE INDEX IF NOT EXISTS idx_vitals_name ON qa_web_vitals(vital_name);
CREATE INDEX IF NOT EXISTS idx_vitals_created ON qa_web_vitals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vitals_rating ON qa_web_vitals(rating);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE qa_lighthouse_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_web_vitals ENABLE ROW LEVEL SECURITY;

-- Lighthouse Results: Only admins can manage
CREATE POLICY "Admins can manage lighthouse results"
  ON qa_lighthouse_results
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  );

-- Web Vitals: Anyone can insert (for real user monitoring)
CREATE POLICY "Anyone can insert vitals"
  ON qa_web_vitals
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow anonymous inserts for vitals (important for RUM)
CREATE POLICY "Anonymous can insert vitals"
  ON qa_web_vitals
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Web Vitals: Only admins can view
CREATE POLICY "Admins can view vitals"
  ON qa_web_vitals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  );

-- ============================================
-- Performance Budgets Table (optional, for alerts)
-- ============================================
CREATE TABLE IF NOT EXISTS qa_performance_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  threshold_good DECIMAL NOT NULL,
  threshold_poor DECIMAL NOT NULL,
  url_pattern TEXT DEFAULT '*',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

COMMENT ON TABLE qa_performance_budgets IS 'Defines performance thresholds for alerting';

-- Enable RLS on budgets
ALTER TABLE qa_performance_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage performance budgets"
  ON qa_performance_budgets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  );

-- Insert default performance budgets based on Core Web Vitals thresholds
INSERT INTO qa_performance_budgets (metric_name, threshold_good, threshold_poor, url_pattern) VALUES
  ('LCP', 2500, 4000, '*'),
  ('INP', 200, 500, '*'),
  ('CLS', 0.1, 0.25, '*'),
  ('FCP', 1800, 3000, '*'),
  ('TTFB', 800, 1800, '*'),
  ('performance_score', 90, 50, '*'),
  ('accessibility_score', 90, 50, '*'),
  ('best_practices_score', 90, 50, '*'),
  ('seo_score', 90, 50, '*')
ON CONFLICT DO NOTHING;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_performance_budgets_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS trg_update_performance_budgets_timestamp ON qa_performance_budgets;
CREATE TRIGGER trg_update_performance_budgets_timestamp
  BEFORE UPDATE ON qa_performance_budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_performance_budgets_timestamp();
