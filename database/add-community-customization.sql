-- Add customization fields to community_workspaces table
-- Allows Growth Communities to rename themselves and add a group image

-- Add custom_name field to store user-defined community name
ALTER TABLE community_workspaces 
ADD COLUMN IF NOT EXISTS custom_name TEXT;

-- Add image_url field to store community group image
ALTER TABLE community_workspaces 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add image_storage_path for Supabase storage reference
ALTER TABLE community_workspaces 
ADD COLUMN IF NOT EXISTS image_storage_path TEXT;

-- Update the updated_at timestamp when these fields change
CREATE OR REPLACE FUNCTION update_community_workspace_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS update_community_workspace_timestamp ON community_workspaces;
CREATE TRIGGER update_community_workspace_timestamp
BEFORE UPDATE ON community_workspaces
FOR EACH ROW
EXECUTE FUNCTION update_community_workspace_timestamp();

-- Add comment for documentation
COMMENT ON COLUMN community_workspaces.custom_name IS 'User-defined name for the community workspace (like WhatsApp group names)';
COMMENT ON COLUMN community_workspaces.image_url IS 'Public URL for the community group image';
COMMENT ON COLUMN community_workspaces.image_storage_path IS 'Supabase storage path for the uploaded image';

-- Update RLS policy to allow community leaders to update these fields
DROP POLICY IF EXISTS "Community leaders and admins can update workspaces" ON community_workspaces;

CREATE POLICY "Community leaders and admins can update workspaces" ON community_workspaces
  FOR UPDATE
  USING (
    -- Allow if user is community leader for this community
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.community_id = community_workspaces.community_id
      AND ur.role_type = 'lider_comunidad'
      AND ur.is_active = TRUE
    )
    OR
    -- Allow if user is admin
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  )
  WITH CHECK (
    -- Same conditions for the CHECK constraint
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.community_id = community_workspaces.community_id
      AND ur.role_type = 'lider_comunidad'
      AND ur.is_active = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  );

-- Create storage bucket for community images if it doesn't exist
-- Note: This needs to be run in Supabase Dashboard under Storage
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('community-images', 'community-images', true)
-- ON CONFLICT (id) DO NOTHING;

-- Grant permissions for community images bucket
-- Note: These policies need to be created in Supabase Dashboard under Storage Policies
-- 1. Allow authenticated users to upload images
-- 2. Allow public read access to community images