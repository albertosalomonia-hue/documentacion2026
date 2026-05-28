import { supabase } from './supabaseClient';

export const UserPreferencesService = {
    getDirName: async (username: string): Promise<string | null> => {
        try {
            const { data } = await supabase
                .from('user_preferences')
                .select('trabajos_dir_name')
                .eq('username', username)
                .maybeSingle();
            return data?.trabajos_dir_name ?? null;
        } catch { return null; }
    },

    setDirName: async (username: string, dirName: string): Promise<void> => {
        try {
            await supabase
                .from('user_preferences')
                .upsert({ username, trabajos_dir_name: dirName }, { onConflict: 'username' });
        } catch { /* silent */ }
    },
};
