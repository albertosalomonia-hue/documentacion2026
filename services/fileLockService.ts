import { supabase } from './supabaseClient';

export interface FileLock {
    id: string;
    file_path: string;
    locked_by: string;
    locked_by_fullname: string;
    locked_at: string;
    last_heartbeat: string;
}

// Lock considered stale after 15 minutes of no heartbeat
const LOCK_EXPIRY_MS = 15 * 60 * 1000;

export const FileLockService = {
    get: async (filePath: string): Promise<FileLock | null> => {
        try {
            const { data } = await supabase
                .from('file_locks')
                .select('*')
                .eq('file_path', filePath)
                .maybeSingle();
            return (data as FileLock) ?? null;
        } catch { return null; }
    },

    /**
     * Try to acquire a lock.
     * - Returns { lock } on success.
     * - Returns { blockedBy } if another user holds an active (non-expired) lock.
     * - Returns { lock: null, blockedBy: null } on Supabase error (fail-open).
     */
    acquire: async (
        filePath: string,
        username: string,
        fullName: string,
    ): Promise<{ lock: FileLock | null; blockedBy: FileLock | null }> => {
        try {
            const existing = await FileLockService.get(filePath);
            if (existing) {
                // Same user reconnecting → refresh heartbeat and return existing lock
                if (existing.locked_by === username) {
                    await FileLockService.heartbeat(filePath, username);
                    return { lock: existing, blockedBy: null };
                }
                // Another user holds it — check expiry
                const age = Date.now() - new Date(existing.last_heartbeat).getTime();
                if (age < LOCK_EXPIRY_MS) {
                    return { lock: null, blockedBy: existing };
                }
                // Stale lock — delete it before acquiring
                await supabase.from('file_locks').delete().eq('file_path', filePath);
            }

            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from('file_locks')
                .insert({ file_path: filePath, locked_by: username, locked_by_fullname: fullName, locked_at: now, last_heartbeat: now })
                .select()
                .single();

            if (error) {
                // 23505 = unique_violation: another user inserted between our get() and insert()
                if (error.code === '23505') {
                    const winner = await FileLockService.get(filePath);
                    if (winner && winner.locked_by !== username) return { lock: null, blockedBy: winner };
                }
                console.error('[FileLock] acquire error:', error.message, '— table "file_locks" may not exist.');
                return { lock: null, blockedBy: null };
            }
            if (!data) return { lock: null, blockedBy: null };
            return { lock: data as FileLock, blockedBy: null };
        } catch (e) {
            console.error('[FileLock] acquire exception:', e);
            return { lock: null, blockedBy: null };
        }
    },

    release: async (filePath: string, username: string): Promise<void> => {
        try {
            await supabase
                .from('file_locks')
                .delete()
                .eq('file_path', filePath)
                .eq('locked_by', username);
        } catch { /* silent */ }
    },

    heartbeat: async (filePath: string, username: string): Promise<void> => {
        try {
            await supabase
                .from('file_locks')
                .update({ last_heartbeat: new Date().toISOString() })
                .eq('file_path', filePath)
                .eq('locked_by', username);
        } catch { /* silent */ }
    },

    getMany: async (filePaths: string[]): Promise<Record<string, FileLock>> => {
        if (!filePaths.length) return {};
        try {
            const { data } = await supabase
                .from('file_locks')
                .select('*')
                .in('file_path', filePaths);
            if (!data) return {};
            return Object.fromEntries((data as FileLock[]).map(l => [l.file_path, l]));
        } catch { return {}; }
    },

    releaseAll: async (username: string): Promise<void> => {
        try {
            await supabase.from('file_locks').delete().eq('locked_by', username);
        } catch { /* silent */ }
    },
};
