/**
 * Persists a FileSystemDirectoryHandle in IndexedDB so it survives page reloads.
 * The browser may still require the user to re-grant permission after a full session
 * restart, but within the same browser session permission is kept automatically.
 */
const DB_NAME  = 'ayala_docs_db';
const STORE    = 'dir_handles';
const KEY      = 'trabajos_dir';
const VERSION  = 1;

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) {
                req.result.createObjectStore(STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror  = () => reject(req.error);
    });
}

export async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(handle, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror    = () => reject(tx.error);
    });
}

export async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(KEY);
            req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
            req.onerror   = () => reject(req.error);
        });
    } catch {
        return null;
    }
}

export async function clearDirHandle(): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(KEY);
            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error);
        });
    } catch { /* silent */ }
}

/** Returns true if the handle still has readwrite permission (no prompt needed). */
export async function hasPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
        const state = await (handle as any).queryPermission({ mode: 'readwrite' });
        return state === 'granted';
    } catch {
        return false;
    }
}

/** Asks the user to re-grant permission. Must be called from a user gesture. */
export async function requestPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
        const state = await (handle as any).requestPermission({ mode: 'readwrite' });
        return state === 'granted';
    } catch {
        return false;
    }
}
