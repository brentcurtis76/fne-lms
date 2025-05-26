-- Add approval_status column to profiles table
-- Status values: 'pending', 'approved', 'rejected'

ALTER TABLE profiles 
ADD COLUMN approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Update existing users to be approved (so they don't get locked out)
UPDATE profiles 
SET approval_status = 'approved' 
WHERE approval_status IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.approval_status IS 'User approval status: pending (awaiting admin approval), approved (can access platform), rejected (access denied)';