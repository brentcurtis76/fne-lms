-- Add invoice fields to cuotas table if they don't exist
DO $$ 
BEGIN
    -- Add factura_url field
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='cuotas' AND column_name='factura_url') THEN
        ALTER TABLE cuotas ADD COLUMN factura_url TEXT;
    END IF;
    
    -- Add factura_pagada field
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='cuotas' AND column_name='factura_pagada') THEN
        ALTER TABLE cuotas ADD COLUMN factura_pagada BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Create storage bucket for invoices if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('facturas', 'facturas', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for facturas bucket
DO $$
BEGIN
    -- Policy for viewing invoices (authenticated users)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND policyname = 'facturas_view_policy'
        AND schemaname = 'storage'
    ) THEN
        CREATE POLICY facturas_view_policy ON storage.objects
        FOR SELECT USING (bucket_id = 'facturas' AND auth.role() = 'authenticated');
    END IF;

    -- Policy for uploading invoices (authenticated users)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND policyname = 'facturas_upload_policy'
        AND schemaname = 'storage'
    ) THEN
        CREATE POLICY facturas_upload_policy ON storage.objects
        FOR INSERT WITH CHECK (bucket_id = 'facturas' AND auth.role() = 'authenticated');
    END IF;

    -- Policy for updating invoices (authenticated users)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND policyname = 'facturas_update_policy'
        AND schemaname = 'storage'
    ) THEN
        CREATE POLICY facturas_update_policy ON storage.objects
        FOR UPDATE USING (bucket_id = 'facturas' AND auth.role() = 'authenticated');
    END IF;

    -- Policy for deleting invoices (authenticated users)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND policyname = 'facturas_delete_policy'
        AND schemaname = 'storage'
    ) THEN
        CREATE POLICY facturas_delete_policy ON storage.objects
        FOR DELETE USING (bucket_id = 'facturas' AND auth.role() = 'authenticated');
    END IF;
END $$;