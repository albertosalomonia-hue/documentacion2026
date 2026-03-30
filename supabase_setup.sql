-- Run this in your Supabase SQL Editor to fix the permission error

-- 1. Enable RLS on the table (if not already enabled)
ALTER TABLE accesos2026 ENABLE ROW LEVEL SECURITY;

-- 2. Create a policy to allow public access to the table
-- This is necessary because the application uses a custom authentication system
-- and connects using the public 'anon' key.
DROP POLICY IF EXISTS "Allow public access to accesos2026" ON accesos2026;

CREATE POLICY "Allow public access to accesos2026"
ON accesos2026
FOR ALL
USING (true)
WITH CHECK (true);

-- 3. Grant usage on the sequence if it exists (for id auto-increment)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
