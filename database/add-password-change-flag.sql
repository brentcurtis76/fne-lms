-- Add a flag to track if users need to change their password on first login
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- Create an index for better performance when checking this flag
CREATE INDEX IF NOT EXISTS idx_profiles_must_change_password 
ON profiles(must_change_password) 
WHERE must_change_password = true;

-- Update RLS policies to allow users to update their own must_change_password flag
CREATE POLICY "Users can update their own password change flag" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);