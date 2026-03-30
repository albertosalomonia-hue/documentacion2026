import { createClient } from '@supabase/supabase-js';

// Configuration from environment or hardcoded fallback
// Using hardcoded values to ensure immediate connectivity for the user
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://aqvtonzstcestkkvdpqb.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_3fnX1QCKmVHZ3PIk0rZztw_cNlthRiP';

// Log warning if we are falling back (for debugging purposes)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.log('Using hardcoded Supabase URL');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    }
});