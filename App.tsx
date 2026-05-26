import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import PlanCard, { AddPlanCard, PlanListItem } from './components/PlanCard';
import LoginScreen from './components/LoginScreen';
import FilePreviewModal from './components/FilePreviewModal';
import ExcelEditorModal from './components/ExcelEditorModal';
import WorkspacePanel, { WorkspaceItem } from './components/WorkspacePanel';
import FileLockModal from './components/FileLockModal';
import { FileLockService } from './services/fileLockService';
import type { FileLock } from './services/fileLockService';
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal';
import UserManagement from './components/UserManagement';
import UserSettings from './components/UserSettings';
import ShareModal from './components/ShareModal';
import { DropboxFile, PlanGroup, User, FileTag, PermissionType } from './types';
import { DropboxService, getDropboxAuthUrl, parseAuthTokenFromUrl, parseAuthCodeFromUrl } from './services/dropboxService';
import { MockAuthService } from './services/mockAuth';
import { NotificationService } from './services/notificationService';
import { UploadCloud, CheckCircle, AlertTriangle, RefreshCw, Trash2, Lock, ShieldAlert, FolderPlus, Home, ChevronRight, Tag, Plus, X, ArrowRight, FileText, Folder as FolderIcon, Loader2, Link2, Shield, Wrench, Edit2, Share2, ExternalLink, Pencil, Download, Briefcase } from 'lucide-react';

const UPLOAD_CONCURRENCY = 6; // archivos subiendo en paralelo al mismo tiempo

function parseUploadError(err: any): string {
  const raw: string = err?.message ?? String(err);
  // Dropbox devuelve JSON dentro del mensaje, ej: "Upload failed: {\"error_summary\":\"too_many_requests/...\"}"
  try {
    const jsonStart = raw.indexOf('{');
    if (jsonStart !== -1) {
      const parsed = JSON.parse(raw.slice(jsonStart));
      const summary: string = parsed?.error_summary ?? parsed?.error?.['.tag'] ?? '';
      if (summary.startsWith('too_many_requests'))  return 'Demasiadas solicitudes (límite Dropbox)';
      if (summary.startsWith('insufficient_space')) return 'Espacio insuficiente en Dropbox';
      if (summary.startsWith('disallowed_name'))    return 'Nombre de archivo no permitido';
      if (summary.startsWith('path/conflict'))      return 'Conflicto de ruta en Dropbox';
      if (summary.startsWith('path/too_long'))      return 'Ruta demasiado larga';
      if (summary.startsWith('path/malformed'))     return 'Nombre de archivo inválido';
      if (summary)                                  return summary;
    }
  } catch { /* no es JSON */ }
  if (/401/.test(raw))              return 'Token expirado — reconectar Dropbox';
  if (/403/.test(raw))              return 'Sin permisos en Dropbox';
  if (/429/.test(raw))              return 'Demasiadas solicitudes (límite Dropbox)';
  if (/fetch|network/i.test(raw))   return 'Error de red — verificar conexión';
  if (/timeout/i.test(raw))         return 'Tiempo de espera agotado';
  return raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
}

const PROVIDED_TOKEN = process.env.NEXT_PUBLIC_DROPBOX_ACCESS_TOKEN;
const CONFIG_ROOT = process.env.NEXT_PUBLIC_DROPBOX_ROOT_PATH || '';

const RESTRICTED_SYSTEM_PATHS = ['/sistemcpe', '/sistemcotizacion', '/sistemdocfact', '/sistemacotizaciones', '/sistemcotizaciones'];

const TAGS_STORAGE_KEY = 'ayala_tags_v1';
const FILE_TAGS_MAP_KEY = 'ayala_file_tags_v1';

const DEFAULT_TAGS: FileTag[] = [
    { id: 't1', label: 'Urgente', color: '#ef4444' }, 
    { id: 't2', label: 'Revisado', color: '#22c55e' }, 
    { id: 't3', label: 'En Proceso', color: '#eab308' }, 
    { id: 't4', label: 'Confidencial', color: '#a855f7' }, 
];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAuthProcessing, setIsAuthProcessing] = useState(true);

  const [currentView, setCurrentView] = useState<string>('plans'); 
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid'); 
  const [currentPath, setCurrentPath] = useState<string>(CONFIG_ROOT || '');
  const [token, setToken] = useState<string>('');
  const [files, setFiles] = useState<DropboxFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Specific state to handle the "Root folder missing" scenario
  const [isRootMissing, setIsRootMissing] = useState(false);
  
  const [availableTags, setAvailableTags] = useState<FileTag[]>([]);
  const [fileTagsMap, setFileTagsMap] = useState<Record<string, string[]>>({});
  
  const [tagModalOpen, setTagModalOpen] = useState<{file: DropboxFile | null, isOpen: boolean}>({file: null, isOpen: false});
  const [shareModalOpen, setShareModalOpen] = useState<{file: DropboxFile | null, isOpen: boolean}>({file: null, isOpen: false});
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');

  const [isExternalDragging, setIsExternalDragging] = useState(false);
  const [internalDraggedFile, setInternalDraggedFile] = useState<DropboxFile | null>(null);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [dragOverBreadcrumb, setDragOverBreadcrumb] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<DropboxFile | null>(null);
  const [excelEditFile, setExcelEditFile] = useState<DropboxFile | null>(null);

  const [moveModal, setMoveModal] = useState<{
      isOpen: boolean;
      source: DropboxFile | null;
      target: DropboxFile | null;
      isMoving: boolean;
  }>({ isOpen: false, source: null, target: null, isMoving: false });

  const [renameModal, setRenameModal] = useState<{
      isOpen: boolean;
      folder: DropboxFile | null;
      isRenaming: boolean;
  }>({ isOpen: false, folder: null, isRenaming: false });

  const [uploadProgress, setUploadProgress] = useState<{
      isOpen: boolean;
      folderName: string;
      files: { name: string; status: 'pending' | 'uploading' | 'done' | 'error' | 'skipped'; oldSize?: number; newSize?: number; errorMsg?: string }[];
      current: number;
      total: number;
  }>({ isOpen: false, folderName: '', files: [], current: 0, total: 0 });

  const [failedFileObjects, setFailedFileObjects] = useState<File[]>([]);
  const [selectedFilePaths, setSelectedFilePaths] = useState<Set<string>>(new Set());

  const [bulkMoveModal, setBulkMoveModal] = useState<{
      isOpen: boolean;
      isMoving: boolean;
      selectedFolder: DropboxFile | null;
      folders: DropboxFile[];
      isLoadingFolders: boolean;
      search: string;
  }>({ isOpen: false, isMoving: false, selectedFolder: null, folders: [], isLoadingFolders: false, search: '' });

  // --- File locking state ---
  const [myActiveLocks, setMyActiveLocks] = useState<Record<string, FileLock>>({});
  const [excelReadOnly, setExcelReadOnly] = useState(false);
  const [fileLockModal, setFileLockModal] = useState<{
      isOpen: boolean;
      file: DropboxFile | null;
      blockedBy: FileLock | null;
      context: 'excel' | 'trabajos' | 'local';
  }>({ isOpen: false, file: null, blockedBy: null, context: 'excel' });

  // Refs so intervals don't need to re-register when state updates
  const myActiveLocksRef = React.useRef<Record<string, FileLock>>({});
  myActiveLocksRef.current = myActiveLocks;
  const trabajosItemsRef = React.useRef<WorkspaceItem[]>([]);
  const trabajosSyncStatusesRef = React.useRef<Record<string, string>>({});

  // --- Workspace (Trabajos) state ---
  const [trabajosDirHandle, setTrabajosDirHandle] = useState<any>(null);
  const [trabajosDirName, setTrabajosDirName] = useState<string | null>(() => localStorage.getItem('trabajos_dir_name'));
  const [trabajosItems, setTrabajosItems] = useState<WorkspaceItem[]>(() => {
      try { return JSON.parse(localStorage.getItem('trabajos_v1') || '[]'); } catch { return []; }
  });
  const [trabajosSyncStatuses, setTrabajosSyncStatuses] = useState<Record<string, 'idle'|'syncing'|'done'|'error'|'missing'>>({});
  const [isTrabajosSyncing, setIsTrabajosSyncing] = useState(false);

  const [trabajosLocks, setTrabajosLocks] = useState<Record<string, FileLock>>({});
  const [visibleFileLocks, setVisibleFileLocks] = useState<Record<string, FileLock>>({});
  const filesRef = React.useRef<DropboxFile[]>([]);

  // Keep refs up-to-date for use inside stable intervals
  trabajosItemsRef.current = trabajosItems;
  trabajosSyncStatusesRef.current = trabajosSyncStatuses;
  filesRef.current = files;

  const [contextMenu, setContextMenu] = useState<{
      isOpen: boolean;
      x: number;
      y: number;
      file: DropboxFile | null;
      canDelete: boolean;
      canDownload: boolean;
      canShare: boolean;
      canRename: boolean;
      lockedBy: FileLock | null;
  }>({ isOpen: false, x: 0, y: 0, file: null, canDelete: false, canDownload: false, canShare: false, canRename: false, lockedBy: null });

  // 1. Initialize Auth and Token
  useEffect(() => {
    const initializeAuth = async () => {
        const savedTags = localStorage.getItem(TAGS_STORAGE_KEY);
        setAvailableTags(savedTags ? JSON.parse(savedTags) : DEFAULT_TAGS);
        const savedTagMap = localStorage.getItem(FILE_TAGS_MAP_KEY);
        setFileTagsMap(savedTagMap ? JSON.parse(savedTagMap) : {});

        // 1. Check for OAuth Callback (PKCE Flow - Code)
        const urlCode = parseAuthCodeFromUrl();
        if (urlCode) {
             console.log("New Dropbox Code detected. Exchanging for tokens...");
             try {
                 const tokenData = await DropboxService.exchangeCodeForToken(urlCode);
                 console.log("Token exchange successful.");
                 
                 const fullTokenData = {
                     accessToken: tokenData.access_token,
                     refreshToken: tokenData.refresh_token,
                     expiresAt: Date.now() + (tokenData.expires_in * 1000)
                 };

                 setToken(fullTokenData.accessToken);
                 
                 // Save to Supabase
                 await MockAuthService.saveGlobalDropboxToken(fullTokenData);
                 alert("✅ Conexión Global Guardada (Acceso Permanente).");
                 
                 window.history.replaceState(null, '', window.location.pathname); // Clean URL
             } catch (e: any) {
                 console.error("Error exchanging code:", e);
                 alert("Error al conectar con Dropbox: " + e.message);
             }
             setIsAuthProcessing(false);
             return;
        }

        // Legacy Implicit Flow check (just in case)
        const urlToken = parseAuthTokenFromUrl();
        if (urlToken) {
            console.log("Legacy Dropbox Token detected.");
            setToken(urlToken);
            try {
                await MockAuthService.saveGlobalDropboxToken({ accessToken: urlToken });
                alert("✅ Conexión Global Guardada (Acceso Temporal).");
            } catch (e) {
                console.error("Error saving global token:", e);
            }
            window.history.replaceState(null, '', window.location.pathname);
            setIsAuthProcessing(false);
            return;
        }

        // 2. Check for Global Token immediately on load
        await fetchGlobalToken();

        // 3. Restore user session from localStorage
        const savedUsername = localStorage.getItem('ayala_current_user');
        if (savedUsername) {
            try {
                const restoredUser = await MockAuthService.getUserByUsername(savedUsername);
                if (restoredUser) {
                    setCurrentUser(restoredUser);
                } else {
                    localStorage.removeItem('ayala_current_user');
                }
            } catch (e) {
                localStorage.removeItem('ayala_current_user');
            }
        }

        // 4. Initialize Default Admin (if DB is accessible)
        try {
            await MockAuthService.initializeDefaultAdmin();
        } catch (e: any) {
            console.error("Failed to initialize default admin:", e);
            if (!savedUsername) {
                setLoginError(e.message);
            }
        }
    };

    initializeAuth();
  }, []);

  // 2. Proactive token refresh — runs every 4 minutes while logged in
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const globalTokenData = await MockAuthService.getGlobalDropboxToken();
        if (!globalTokenData?.refreshToken || !globalTokenData.expiresAt) return;
        // Refresh if expiring within the next 5 minutes
        if (Date.now() > globalTokenData.expiresAt - 300000) {
          const refreshed = await DropboxService.refreshAccessToken(globalTokenData.refreshToken);
          const newExpiresAt = Date.now() + refreshed.expires_in * 1000;
          await MockAuthService.saveGlobalDropboxToken({
            accessToken: refreshed.access_token,
            refreshToken: globalTokenData.refreshToken,
            expiresAt: newExpiresAt,
          });
          setToken(refreshed.access_token);
        }
      } catch { /* silent — will retry next interval */ }
    }, 240000); // every 4 minutes
    return () => clearInterval(id);
  }, []);

  // 3. Heartbeat — keep held locks alive every 2 minutes
  useEffect(() => {
    if (!currentUser) return;
    const id = setInterval(() => {
      Object.keys(myActiveLocksRef.current).forEach(path =>
        FileLockService.heartbeat(path, currentUser.username)
      );
    }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [currentUser]);

  // 4. Release all locks when the page/tab is closed
  useEffect(() => {
    const handler = () => {
      if (currentUser) FileLockService.releaseAll(currentUser.username);
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [currentUser]);

  // 5. Auto-sync Trabajos — poll every 30 s for local file changes
  useEffect(() => {
    if (!token || !currentUser) return;
    const id = setInterval(async () => {
      const handle = trabajosDirHandle; // stable closure
      if (!handle) return;
      const service = new DropboxService(token);
      for (const item of trabajosItemsRef.current) {
        if (trabajosSyncStatusesRef.current[item.dropboxPath] === 'syncing') continue;
        try {
          const fh = await handle.getFileHandle(item.name).catch(() => null);
          if (!fh) continue;
          const localFile: File = await fh.getFile();
          if (localFile.lastModified <= new Date(item.downloadedAt).getTime()) continue;
          // File was modified — auto-upload
          setTrabajosSyncStatuses(prev => ({ ...prev, [item.dropboxPath]: 'syncing' }));
          try {
            await service.uploadFile('', localFile, item.dropboxPath);
            setTrabajosItems(prev => {
              const updated = prev.map(f =>
                f.dropboxPath === item.dropboxPath
                  ? { ...f, downloadedAt: new Date().toISOString() }
                  : f
              );
              localStorage.setItem('trabajos_v1', JSON.stringify(updated));
              return updated;
            });
            setTrabajosSyncStatuses(prev => ({ ...prev, [item.dropboxPath]: 'done' }));
            // Release lock after successful auto-sync so others can access the file
            if (myActiveLocksRef.current[item.dropboxPath]) {
              FileLockService.release(item.dropboxPath, currentUser.username);
              setMyActiveLocks(prev => { const n = { ...prev }; delete n[item.dropboxPath]; return n; });
            }
          } catch {
            setTrabajosSyncStatuses(prev => ({ ...prev, [item.dropboxPath]: 'error' }));
          }
        } catch { /* directory permission error — skip */ }
      }
    }, 30000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajosDirHandle, token, currentUser]);

  // 6. Poll locks for workspace items every 20 s so the badge stays fresh
  const refreshTrabajosLocks = useCallback(async () => {
      const paths = trabajosItemsRef.current.map(i => i.dropboxPath);
      if (!paths.length) { setTrabajosLocks({}); return; }
      const locks = await FileLockService.getMany(paths);
      setTrabajosLocks(locks);
  }, []);

  useEffect(() => {
      if (!currentUser) return;
      refreshTrabajosLocks();
      const id = setInterval(refreshTrabajosLocks, 20000);
      return () => clearInterval(id);
  }, [currentUser, refreshTrabajosLocks]);

  // Re-fetch locks immediately when workspace items change
  useEffect(() => {
      if (currentUser) refreshTrabajosLocks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajosItems]);

  // 7. Poll locks for ALL visible files every 20 s (drives context-menu lock state)
  const refreshVisibleLocks = useCallback(async () => {
      const paths = filesRef.current
          .filter(f => f['.tag'] !== 'folder')
          .map(f => f.path_lower);
      if (!paths.length) { setVisibleFileLocks({}); return; }
      const locks = await FileLockService.getMany(paths);
      setVisibleFileLocks(locks);
  }, []);

  useEffect(() => {
      if (!currentUser) return;
      refreshVisibleLocks();
      const id = setInterval(refreshVisibleLocks, 20000);
      return () => clearInterval(id);
  }, [currentUser, refreshVisibleLocks]);

  // Refresh when the file list changes (navigation, upload, delete)
  useEffect(() => {
      if (currentUser) refreshVisibleLocks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // Helper to fetch global token
  const fetchGlobalToken = async () => {
      try {
          // Add timeout to prevent hanging if Supabase is unreachable
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000));
          const tokenPromise = MockAuthService.getGlobalDropboxToken();
          
          const globalTokenData = await Promise.race([tokenPromise, timeoutPromise]) as any;

          if (globalTokenData) {
              console.log("Global Dropbox connection found.");
              
              let currentAccessToken = globalTokenData.accessToken;
              
              // Check Expiry and Refresh if needed
              if (globalTokenData.refreshToken && globalTokenData.expiresAt) {
                  const timeNow = Date.now();
                  // Refresh if expired or expiring in less than 5 minutes (300000ms)
                  if (timeNow > (globalTokenData.expiresAt - 300000)) {
                      console.log("Token expired or expiring. Refreshing...");
                      try {
                          const refreshed = await DropboxService.refreshAccessToken(globalTokenData.refreshToken);
                          currentAccessToken = refreshed.access_token;
                          
                          // Update DB with new access token and expiry
                          const newExpiresAt = Date.now() + (refreshed.expires_in * 1000);
                          const updatedTokenData = {
                              accessToken: currentAccessToken,
                              refreshToken: globalTokenData.refreshToken, // Keep existing refresh token
                              expiresAt: newExpiresAt
                          };
                          
                          await MockAuthService.saveGlobalDropboxToken(updatedTokenData);
                          console.log("Token refreshed and saved.");
                      } catch (refreshErr) {
                          console.error("Failed to refresh token:", refreshErr);
                          // Fallback to existing token, might fail but better than nothing
                      }
                  }
              }

              setToken(currentAccessToken);
              setError(null); // Clear any previous errors
          } else {
              console.log("No global token found.");
              // Fallback to Env if no global token
              if (PROVIDED_TOKEN) {
                  console.log("Using Environment Token.");
                  setToken(PROVIDED_TOKEN);
              }
          }
      } catch (e) {
          console.error("Error fetching global token:", e);
          // Fallback to Env on error
          if (PROVIDED_TOKEN) {
             console.log("Error fetching global, using Environment Token.");
             setToken(PROVIDED_TOKEN);
          }
      } finally {
          setIsAuthProcessing(false);
      }
  };

  const handleResetGlobalToken = async () => {
      if (!confirm("¿Estás seguro de eliminar la conexión global? El sistema intentará usar el token del archivo .env si existe.")) return;
      try {
          // We can't easily "delete" the row with current MockAuthService, but we can clear the token
          // Or we can implement a delete method. For now, let's just clear it in DB.
          // Actually MockAuthService.saveGlobalDropboxToken uses upsert.
          // Let's try to set it to empty or null.
          await MockAuthService.saveGlobalDropboxToken({ accessToken: '' }); 
          alert("Conexión global eliminada. Recargando...");
          window.location.reload();
      } catch (e: any) {
          alert("Error al eliminar conexión global: " + e.message);
      }
  };

  const getDropboxService = useCallback(() => {
    return new DropboxService(token);
  }, [token]);

  const getEffectivePermissions = useCallback((file: DropboxFile, user: User): PermissionType[] => {
      if (user.role === 'admin') return ['read', 'write', 'delete', 'download'];
      let permissions = new Set<PermissionType>();

      const folderRule = user.allowedFolders?.find(rule => 
          file.path_lower.startsWith(rule.pathPrefix.toLowerCase()) || rule.pathPrefix === '/'
      );
      if (folderRule) folderRule.permissions.forEach(p => permissions.add(p));

      const fileShare = user.sharedFiles?.find(f => f.path === file.path_lower);
      if (fileShare) fileShare.permissions.forEach(p => permissions.add(p));

      return Array.from(permissions);
  }, []);

  const handleLogin = async (u: string, p: string) => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const user = await MockAuthService.login(u, p);
      setCurrentUser(user);
      localStorage.setItem('ayala_current_user', user.username);
      
      // NOTIFY LOGIN
      await NotificationService.create('system', `Usuario inició sesión: ${user.username}`, user.username);
      
      await fetchGlobalToken();
    } catch (e: any) {
      setLoginError(e.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    if (currentUser) {
        NotificationService.create('system', `Usuario cerró sesión: ${currentUser.username}`, currentUser.username);
        FileLockService.releaseAll(currentUser.username);
    }
    setCurrentUser(null);
    setFiles([]);
    setCurrentView('plans');
    setMyActiveLocks({});
    localStorage.removeItem('ayala_current_user');
  };

  const handleUserUpdate = (updatedUser: User) => {
      setCurrentUser(updatedUser);
  };

  const isRestrictedPath = (path: string) => {
      const lowerPath = path.toLowerCase();
      return RESTRICTED_SYSTEM_PATHS.some(restricted => 
          lowerPath === restricted || lowerPath.startsWith(restricted + '/')
      );
  };

  const isFileVisibleToUser = (file: DropboxFile, user: User) => {
      if (user.role === 'admin') return true;
      const hasDirectAccess = user.allowedFolders?.some(rule =>
          file.path_lower.startsWith(rule.pathPrefix.toLowerCase()) || rule.pathPrefix === '/'
      );
      if (hasDirectAccess) return true;
      if (file['.tag'] === 'folder') {
          const isParentOfAllowed = user.allowedFolders?.some(rule =>
              rule.pathPrefix.toLowerCase().startsWith(file.path_lower + '/')
          );
          if (isParentOfAllowed) return true;
      }
      const isSharedFile = user.sharedFiles?.some(sf => sf.path === file.path_lower);
      if (isSharedFile) return true;
      return false;
  };

  // Check if user can create folders in the given path
  const canCreateFolderInPath = (path: string, user: User): boolean => {
      if (user.role === 'admin') return true;
      
      // Check if user has write permission in any folder that contains this path
      return user.allowedFolders?.some(rule => {
          const rulePath = rule.pathPrefix.toLowerCase();
          const targetPath = path.toLowerCase();
          
          // User can create if they have write permission in:
          // 1. The exact path
          // 2. A parent folder of the path
          const isInScope = rulePath === '/' || targetPath === rulePath || targetPath.startsWith(rulePath + '/');
          return isInScope && rule.permissions.includes('write');
      }) ?? false;
  };

  // Check if user can delete a specific folder
  const canDeleteFolder = (folder: DropboxFile, user: User): boolean => {
      if (user.role === 'admin') return true;
      
      const folderPath = folder.path_lower;
      
      // Check if user has delete permission for this folder
      return user.allowedFolders?.some(rule => {
          const rulePath = rule.pathPrefix.toLowerCase();
          
          // User can delete if they have delete permission in:
          // 1. The exact folder path
          // 2. A parent folder of this folder
          const isInScope = rulePath === '/' || folderPath === rulePath || folderPath.startsWith(rulePath + '/');
          return isInScope && rule.permissions.includes('delete');
      }) ?? false;
  };

  // Check if user can rename a specific folder
  const canRenameFolder = (folder: DropboxFile, user: User): boolean => {
      if (user.role === 'admin') return true;

      const folderPath = folder.path_lower;

      // User can rename if they have write permission for this folder or a parent
      return user.allowedFolders?.some(rule => {
          const rulePath = rule.pathPrefix.toLowerCase();
          const isInScope = rulePath === '/' || folderPath === rulePath || folderPath.startsWith(rulePath + '/');
          return isInScope && rule.permissions.includes('write');
      }) ?? false;
  };

  const getEditorInfo = (fileName: string): { name: string; color: string } => {
      if (fileName.match(/\.(docx|doc)$/i)) return { name: 'Microsoft Word', color: 'text-blue-600' };
      if (fileName.match(/\.(xlsx|xls|csv)$/i)) return { name: 'Microsoft Excel', color: 'text-green-600' };
      if (fileName.match(/\.(pptx|ppt)$/i)) return { name: 'Microsoft PowerPoint', color: 'text-orange-500' };
      if (fileName.match(/\.(pdf)$/i)) return { name: 'Adobe Acrobat / PDF', color: 'text-red-600' };
      if (fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i)) return { name: 'Editor de imágenes', color: 'text-purple-600' };
      if (fileName.match(/\.(mp4|avi|mov|mkv|wmv)$/i)) return { name: 'Reproductor de video', color: 'text-pink-500' };
      if (fileName.match(/\.(mp3|wav|flac|aac)$/i)) return { name: 'Reproductor de audio', color: 'text-yellow-500' };
      if (fileName.match(/\.(txt|md|log)$/i)) return { name: 'Editor de texto', color: 'text-gray-600' };
      if (fileName.match(/\.(zip|rar|7z|tar|gz)$/i)) return { name: 'Compresor de archivos', color: 'text-amber-600' };
      if (fileName.match(/\.(js|ts|jsx|tsx|py|java|cs|cpp|html|css)$/i)) return { name: 'Editor de código', color: 'text-indigo-600' };
      return { name: 'Programa predeterminado', color: 'text-gray-500' };
  };

  const handleContextMenuOpen = (file: DropboxFile, x: number, y: number) => {
      const perms = getEffectivePermissions(file, currentUser!);
      const isFolder = file['.tag'] === 'folder';
      const canShare = !!(currentUser && (currentUser.role === 'admin' || (currentUser.role === 'jefe' && (perms.includes('write') || perms.includes('read')))));
      const lock = visibleFileLocks[file.path_lower] ?? null;
      const lockedBy = (lock && lock.locked_by !== currentUser!.username) ? lock : null;
      setContextMenu({
          isOpen: true,
          x,
          y,
          file,
          canDelete: perms.includes('delete'),
          canDownload: perms.includes('download') && !isFolder,
          canShare,
          canRename: isFolder ? canRenameFolder(file, currentUser!) : false,
          lockedBy,
      });
  };

  const initiateDropboxAuth = async () => {
      const url = await getDropboxAuthUrl();
      window.location.href = url;
  };

  const refreshFiles = useCallback(async () => {
    if (!token) {
        setFiles([]);
        return; 
    }
    if (!currentUser || currentView !== 'plans') return;

    setIsLoading(true);
    setError(null);
    setIsRootMissing(false); // Reset specific error state

    try {
      const service = getDropboxService();
      
      let rawFiles: DropboxFile[] = [];
      try {
          rawFiles = await service.listFiles(currentPath);
      } catch (e: any) {
          // Detect invalid token / 401
          if (e.message && (e.message.includes('Invalid Access Token') || e.message.includes('401') || e.message.includes('expired_access_token'))) {
              console.warn("Token expired.");
              setError('Conexión expirada. El administrador debe reconectar.');
              setIsLoading(false);
              return;
          }

          // HANDLE PATH NOT FOUND
          if (e.message && (e.message.includes('path/not_found') || e.message.includes('not_found'))) {
              console.warn("Path not found:", currentPath);
              
              if (currentPath === CONFIG_ROOT && CONFIG_ROOT !== '' && CONFIG_ROOT !== '/') {
                  // If the configured root doesn't exist, we have a setup problem.
                  setIsRootMissing(true);
                  // Don't clear files immediately, allow UI to show "Create Folder" button
                  rawFiles = []; 
              } else if (currentPath !== '') {
                  // If we are deep in a folder that was deleted, go back to root
                  alert("La carpeta actual ya no existe. Volviendo al inicio.");
                  setCurrentPath('');
                  return; 
              } else {
                  // Even root is missing? Empty list.
                  rawFiles = [];
              }
          } else {
              throw e;
          }
      }

      let visibleFiles = rawFiles.filter(f => !isRestrictedPath(f.path_lower));
      if (currentUser.role !== 'admin') {
         visibleFiles = visibleFiles.filter(file => isFileVisibleToUser(file, currentUser));
      }

      const taggedFiles = visibleFiles.map(f => ({
          ...f,
          tags: fileTagsMap[f.id] || []
      }));

      setFiles(taggedFiles);
    } catch (err: any) {
        setError(err.message || 'Error al obtener archivos');
    } finally {
      setIsLoading(false);
    }
  }, [token, currentUser, getDropboxService, currentPath, fileTagsMap, currentView]);

  useEffect(() => {
    if (currentUser && token && currentView === 'plans') {
      refreshFiles();
    } else if (currentUser && !token && currentView === 'plans') {
        setFiles([]);
    }
  }, [currentUser, token, refreshFiles, currentPath, fileTagsMap, currentView]);

  useEffect(() => {
      const handleClick = () => setContextMenu(prev => ({ ...prev, isOpen: false }));
      const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(prev => ({ ...prev, isOpen: false })); };
      document.addEventListener('click', handleClick);
      document.addEventListener('keydown', handleEsc);
      return () => {
          document.removeEventListener('click', handleClick);
          document.removeEventListener('keydown', handleEsc);
      };
  }, []);

  const handleNavigate = (path: string) => {
      if (isRestrictedPath(path)) {
          alert("Acceso denegado: Esta carpeta del sistema está restringida.");
          return;
      }
      setSelectedFilePaths(new Set());
      setCurrentPath(path);
  };

  const handleOpenExcel = async (file: DropboxFile) => {
      const canEditPerm = currentUser ? getEffectivePermissions(file, currentUser).includes('write') : false;
      if (canEditPerm) {
          const { lock, blockedBy } = await FileLockService.acquire(
              file.path_lower, currentUser!.username, currentUser!.fullName
          );
          if (blockedBy) {
              setFileLockModal({ isOpen: true, file, blockedBy, context: 'excel' });
              return;
          }
          if (lock) setMyActiveLocks(prev => ({ ...prev, [file.path_lower]: lock }));
      }
      setExcelReadOnly(!canEditPerm);
      setExcelEditFile(file);
  };

  const handleExcelClose = () => {
      if (excelEditFile && currentUser && myActiveLocksRef.current[excelEditFile.path_lower]) {
          FileLockService.release(excelEditFile.path_lower, currentUser.username);
          setMyActiveLocks(prev => { const n = { ...prev }; delete n[excelEditFile.path_lower]; return n; });
      }
      setExcelEditFile(null);
      setExcelReadOnly(false);
  };

  const handleCardClick = (file: DropboxFile) => {
      if (file['.tag'] === 'folder') {
          handleNavigate(file.path_lower);
      } else if (file.name.match(/\.(xlsx|xls)$/i)) {
          handleOpenExcel(file);
      } else {
          setPreviewFile(file);
      }
  };

  const handleCreateFolder = async () => {
      if (!token) { alert("Sin conexión a Dropbox."); return; }

      // Validate if user can create folders in current path
      if (!canCreateFolderInPath(currentPath, currentUser)) {
          return; // Button is disabled, do nothing
      }
      
      const raw = prompt("Nombre de la nueva carpeta:")?.trim() ?? '';
      if (!raw) return;
      if (raw.includes('/')) { alert("El nombre de la carpeta no puede contener '/'."); return; }
      const folderName = raw;

      const base = currentPath.replace(/\/+$/, '');
      const newFolderPath = (base === '' ? `/${folderName}` : `${base}/${folderName}`).toLowerCase();
      if (isRestrictedPath(newFolderPath)) { alert("Nombre restringido."); return; }

      try {
          setIsLoading(true);
          const service = getDropboxService();
          await service.createFolder(base === '' ? `/${folderName}` : `${base}/${folderName}`);

          // NOTIFY
          await NotificationService.create('upload', `Creó carpeta: ${folderName}`, currentUser?.username || 'unknown');

          await refreshFiles();
      } catch (err: any) {
          alert("Error: " + err.message);
      } finally {
          setIsLoading(false);
      }
  };

  const handleRenameFolder = async (folder: DropboxFile) => {
      if (!token) { alert("Sin conexión a Dropbox."); return; }
      if (!canRenameFolder(folder, currentUser)) {
          alert("No tienes permisos para renombrar esta carpeta.");
          return;
      }

      const newName = prompt("Nuevo nombre para la carpeta:", folder.name);
      if (!newName || newName.trim() === '') return;
      if (newName.includes('/')) { alert("El nombre no puede contener '/'."); return; }

      const parentPath = folder.path_lower.substring(0, folder.path_lower.lastIndexOf('/'));
      const newPath = parentPath === '' ? `/${newName.trim()}` : `${parentPath}/${newName.trim()}`;
      if (isRestrictedPath(newPath.toLowerCase())) { alert("Nombre restringido."); return; }

      try {
          setIsLoading(true);
          const service = getDropboxService();
          await service.renameFolder(folder.path_lower, newName.trim());

          await NotificationService.create('upload', `Renombró carpeta: "${folder.name}" → "${newName.trim()}"`, currentUser?.username || 'unknown');

          await refreshFiles();
      } catch (err: any) {
          alert("Error al renomrar: " + err.message);
      } finally {
          setIsLoading(false);
      }
  };

  const createRootStructure = async () => {
      if (!token) { alert("Sin conexión a Dropbox."); return; }
      
      try {
          setIsLoading(true);
          const service = getDropboxService();
          await service.createFolder(CONFIG_ROOT);
          setIsRootMissing(false);
          setCurrentPath(CONFIG_ROOT);
          await refreshFiles();
      } catch (err: any) {
          alert("Error al crear carpeta: " + err.message);
      } finally {
          setIsLoading(false);
      }
  };
  
  // ...

  const processFileUpload = async (uploadFiles: FileList | File[]) => {
    if (!token) { alert("Sin conexión a Dropbox."); return; }
    if (!canCreateFolderInPath(currentPath, currentUser!)) {
        alert("No tienes permisos para subir archivos a esta carpeta.");
        return;
    }

    const fileArray = Array.from(uploadFiles);
    const folderName = (() => {
        const rel = (fileArray[0] as any)?.webkitRelativePath as string | undefined;
        return rel ? rel.split('/')[0] : '';
    })();

    // Classify: files that already exist in Dropbox are skipped
    const toUpload: { file: File; idx: number }[] = [];
    const fileEntries = fileArray.map((f, idx) => {
        const existing = files.find(ef => ef['.tag'] !== 'folder' && ef.name.toLowerCase() === f.name.toLowerCase());
        if (existing) {
            return { name: f.name, status: 'skipped' as const, oldSize: existing.size, newSize: f.size };
        }
        toUpload.push({ file: f, idx });
        return { name: f.name, status: 'pending' as const, oldSize: undefined, newSize: f.size };
    });

    setUploadProgress({ isOpen: true, folderName, files: fileEntries, current: 0, total: toUpload.length });
    setFailedFileObjects([]);

    if (toUpload.length === 0) {
        await refreshFiles();
        return; // modal stays open — allFinished = true → shows Cerrar
    }

    const service = getDropboxService();
    const uploadedPaths: string[] = [];
    const failed: File[] = [];
    let completed = 0;
    const queue = [...toUpload];
    const user = currentUser?.username || 'unknown';

    const uploadWorker = async () => {
        while (true) {
            const item = queue.shift();
            if (!item) break;
            const { file, idx } = item;

            setUploadProgress(prev => {
                const updated = [...prev.files];
                updated[idx] = { ...updated[idx], status: 'uploading' };
                return { ...prev, files: updated };
            });

            try {
                const uploaded = await service.uploadFile(currentPath, file);
                uploadedPaths.push(uploaded.path_lower);
                completed++;
                setUploadProgress(prev => {
                    const updated = [...prev.files];
                    updated[idx] = { ...updated[idx], status: 'done' };
                    return { ...prev, files: updated, current: completed };
                });
            } catch (err: any) {
                console.error(err);
                failed.push(file);
                completed++;
                const errorMsg = parseUploadError(err);
                setUploadProgress(prev => {
                    const updated = [...prev.files];
                    updated[idx] = { ...updated[idx], status: 'error', errorMsg };
                    return { ...prev, files: updated, current: completed };
                });
            }
        }
    };

    // Lanzar N workers en paralelo
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, toUpload.length) }, uploadWorker));

    // Notificación única al final (no bloquea la subida)
    if (uploadedPaths.length > 0) {
        NotificationService.create('upload', `Subió ${uploadedPaths.length} archivo(s)`, user).catch(console.error);
    }

    if (currentUser && currentUser.role !== 'admin' && uploadedPaths.length > 0) {
        try {
            const updatedUser = await MockAuthService.grantDeleteForUploadedFiles(currentUser.username, uploadedPaths);
            setCurrentUser(updatedUser);
        } catch (e) { console.error('Error al registrar permisos:', e); }
    }

    setFailedFileObjects(failed);
    await refreshFiles();

    if (!failed.length) {
        setTimeout(() => setUploadProgress({ isOpen: false, folderName: '', files: [], current: 0, total: 0 }), 1500);
    }
  };

  const handleReenviar = async () => {
    if (!failedFileObjects.length || !token) return;

    const retrying = [...failedFileObjects];
    const basePath = currentPath.replace(/\/+$/, '');

    // Reset failed → pending in the UI (also clear old error message)
    setUploadProgress(prev => ({
        ...prev,
        files: prev.files.map(f =>
            f.status === 'error' ? { ...f, status: 'pending' as const, errorMsg: undefined } : f
        ),
        total: retrying.length,
        current: 0,
    }));
    setFailedFileObjects([]);

    const service = getDropboxService();
    const uploadedPaths: string[] = [];
    const failed: File[] = [];
    let completed = 0;
    const queue = [...retrying];
    // Fewer workers on retry to reduce pressure on Dropbox rate limits
    const retryConcurrency = Math.min(3, retrying.length);

    const retryWorker = async () => {
        while (true) {
            const file = queue.shift();
            if (!file) break;

            // For folder uploads: webkitRelativePath = "FolderName/sub/file.txt"
            // For individual uploads: webkitRelativePath is "" or undefined
            const progressName = file.webkitRelativePath || file.name;
            const explicitPath = file.webkitRelativePath
                ? (basePath === '' ? '' : basePath) + '/' + file.webkitRelativePath
                : undefined;

            setUploadProgress(prev => ({
                ...prev,
                files: prev.files.map(f => f.name === progressName ? { ...f, status: 'uploading' as const } : f),
            }));

            let uploadError: any = null;
            let uploadedFile: any = null;

            // First attempt
            try {
                uploadedFile = await service.uploadFile(currentPath, file, explicitPath);
            } catch (err) {
                uploadError = err;
            }

            // Automatic second attempt after a pause (handles transient errors and rate limits)
            if (uploadError) {
                await new Promise(r => setTimeout(r, 3000));
                try {
                    uploadedFile = await service.uploadFile(currentPath, file, explicitPath);
                    uploadError = null;
                } catch (err) {
                    uploadError = err;
                }
            }

            if (!uploadError && uploadedFile) {
                uploadedPaths.push(uploadedFile.path_lower);
                completed++;
                setUploadProgress(prev => ({
                    ...prev,
                    files: prev.files.map(f => f.name === progressName ? { ...f, status: 'done' as const } : f),
                    current: completed,
                }));
            } else {
                console.error(uploadError);
                failed.push(file);
                completed++;
                const errorMsg = parseUploadError(uploadError);
                setUploadProgress(prev => ({
                    ...prev,
                    files: prev.files.map(f => f.name === progressName ? { ...f, status: 'error' as const, errorMsg } : f),
                    current: completed,
                }));
            }
        }
    };

    await Promise.all(Array.from({ length: retryConcurrency }, retryWorker));

    if (uploadedPaths.length > 0) {
        NotificationService.create('upload', `Reenvió ${uploadedPaths.length} archivo(s)`, currentUser?.username || 'unknown').catch(console.error);
    }

    if (currentUser && currentUser.role !== 'admin' && uploadedPaths.length > 0) {
        try {
            const updatedUser = await MockAuthService.grantDeleteForUploadedFiles(currentUser.username, uploadedPaths);
            setCurrentUser(updatedUser);
        } catch (e) { console.error('Error al registrar permisos:', e); }
    }

    setFailedFileObjects(failed);
    await refreshFiles();

    if (!failed.length) {
        setTimeout(() => setUploadProgress({ isOpen: false, folderName: '', files: [], current: 0, total: 0 }), 1500);
    }
  };

  const handleDelete = async (file: DropboxFile) => {
    if (!confirm(`¿Eliminar "${file.name}"?`)) return;
    if (!token) return;

    // Validate if user can delete this folder/file
    if (file['.tag'] === 'folder' && !canDeleteFolder(file, currentUser)) {
        alert("No tienes permisos para eliminar esta carpeta. Solo puedes eliminar carpetas dentro de tu espacio de trabajo asignado.");
        return;
    }

    try {
        setIsLoading(true);
        const service = getDropboxService();
        await service.deleteFile(file.path_lower);

        // NOTIFY
        await NotificationService.create('delete', `Eliminó: ${file.name}`, currentUser?.username || 'unknown');

        await refreshFiles();
    } catch (err: any) {
        alert(`Error al eliminar: ${err.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const handleBulkDelete = async () => {
      if (selectedFilePaths.size === 0) return;
      const count = selectedFilePaths.size;
      if (!confirm(`¿Eliminar ${count} archivo(s) seleccionado(s)? Esta acción no se puede deshacer.`)) return;
      if (!token) return;
      try {
          setIsLoading(true);
          const service = getDropboxService();
          const queue = (Array.from(selectedFilePaths) as string[]).slice();

          // Worker queue — max 5 concurrent deletes to avoid CORS rate-limit
          const worker = async () => {
              while (true) {
                  const p = queue.shift();
                  if (!p) break;
                  await service.deleteFile(p);
              }
          };
          await Promise.all(Array.from({ length: Math.min(5, count) }, worker));

          await NotificationService.create('delete', `Eliminó ${count} archivos en masa`, currentUser?.username || 'unknown');
          setSelectedFilePaths(new Set());
          await refreshFiles();
      } catch (err: any) {
          alert(`Error al eliminar: ${err.message}`);
      } finally {
          setIsLoading(false);
      }
  };

  // --- Workspace (Trabajos) handlers ---

  const handleConfigureTrabajosDir = async () => {
      if (!('showDirectoryPicker' in window)) return;
      try {
          const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
          setTrabajosDirHandle(handle);
          setTrabajosDirName(handle.name);
          localStorage.setItem('trabajos_dir_name', handle.name);
      } catch { /* user cancelled */ }
  };

  const doDownloadToTrabajos = async (file: DropboxFile) => {
      if (!token) return;
      try {
          const service = getDropboxService();
          const url = await service.getTemporaryLink(file.path_lower);
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();

          if (trabajosDirHandle) {
              const fh = await trabajosDirHandle.getFileHandle(file.name, { create: true });
              const writable = await fh.createWritable();
              await writable.write(blob);
              await writable.close();
          } else {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = file.name;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(a.href);
          }

          const newItem: WorkspaceItem = {
              name: file.name,
              dropboxPath: file.path_lower,
              downloadedAt: new Date().toISOString(),
              size: file.size || 0,
              openedByUsername: currentUser?.username,
              openedByFullName: currentUser?.fullName,
          };
          setTrabajosItems(prev => {
              const updated = [...prev.filter(f => f.dropboxPath !== file.path_lower), newItem];
              localStorage.setItem('trabajos_v1', JSON.stringify(updated));
              return updated;
          });
          setTrabajosSyncStatuses(prev => ({ ...prev, [file.path_lower]: 'idle' }));
          setCurrentView('trabajos');
      } catch (err: any) {
          alert(`Error al guardar en Trabajos: ${err.message}`);
      }
  };

  const handleDownloadToTrabajos = async (file: DropboxFile) => {
      if (!token) return;
      const canEdit = currentUser ? getEffectivePermissions(file, currentUser).includes('write') : false;
      if (canEdit) {
          const { lock, blockedBy } = await FileLockService.acquire(
              file.path_lower, currentUser!.username, currentUser!.fullName
          );
          if (blockedBy) {
              setFileLockModal({ isOpen: true, file, blockedBy, context: 'trabajos' });
              return;
          }
          if (lock) {
              setMyActiveLocks(prev => ({ ...prev, [file.path_lower]: lock }));
              refreshTrabajosLocks();
          }
      }
      await doDownloadToTrabajos(file);
  };

  const handleSincronizarAll = async () => {
      if (!token || trabajosItems.length === 0) return;
      if (!trabajosDirHandle) {
          alert('Configura el directorio Trabajos primero para sincronizar automáticamente, o usa "Subir editado" por archivo.');
          return;
      }
      setIsTrabajosSyncing(true);
      const service = getDropboxService();
      const newStatuses: Record<string, 'idle'|'syncing'|'done'|'error'|'missing'> = {};

      for (const item of trabajosItems) {
          newStatuses[item.dropboxPath] = 'syncing';
          setTrabajosSyncStatuses({ ...newStatuses });
          try {
              const fh = await trabajosDirHandle.getFileHandle(item.name).catch(() => null);
              if (!fh) {
                  newStatuses[item.dropboxPath] = 'missing';
              } else {
                  const localFile = await fh.getFile();
                  await service.uploadFile('', localFile, item.dropboxPath);
                  newStatuses[item.dropboxPath] = 'done';
                  // Release lock after successful sync so others can access the file
                  if (currentUser && myActiveLocksRef.current[item.dropboxPath]) {
                      FileLockService.release(item.dropboxPath, currentUser.username);
                      setMyActiveLocks(prev => { const n = { ...prev }; delete n[item.dropboxPath]; return n; });
                  }
              }
          } catch {
              newStatuses[item.dropboxPath] = 'error';
          }
          setTrabajosSyncStatuses({ ...newStatuses });
      }

      setIsTrabajosSyncing(false);
      refreshTrabajosLocks();
      await refreshFiles();
  };

  const handleSincronizarItem = async (item: WorkspaceItem, file: File) => {
      if (!token) return;
      setTrabajosSyncStatuses(prev => ({ ...prev, [item.dropboxPath]: 'syncing' }));
      try {
          const service = getDropboxService();
          await service.uploadFile('', file, item.dropboxPath);
          setTrabajosSyncStatuses(prev => ({ ...prev, [item.dropboxPath]: 'done' }));
          // Release lock after successful sync so others can access the file
          if (currentUser && myActiveLocksRef.current[item.dropboxPath]) {
              FileLockService.release(item.dropboxPath, currentUser.username);
              setMyActiveLocks(prev => { const n = { ...prev }; delete n[item.dropboxPath]; return n; });
              refreshTrabajosLocks();
          }
          await refreshFiles();
      } catch (err: any) {
          setTrabajosSyncStatuses(prev => ({ ...prev, [item.dropboxPath]: 'error' }));
          alert(`Error al sincronizar "${item.name}": ${err.message}`);
      }
  };

  const handleRemoveFromTrabajos = (dropboxPath: string) => {
      if (currentUser && myActiveLocksRef.current[dropboxPath]) {
          FileLockService.release(dropboxPath, currentUser.username).then(refreshTrabajosLocks);
          setMyActiveLocks(prev => { const n = { ...prev }; delete n[dropboxPath]; return n; });
      }
      setTrabajosItems(prev => {
          const updated = prev.filter(f => f.dropboxPath !== dropboxPath);
          localStorage.setItem('trabajos_v1', JSON.stringify(updated));
          return updated;
      });
      setTrabajosSyncStatuses(prev => {
          const next = { ...prev };
          delete next[dropboxPath];
          return next;
      });
  };

  const handleBulkMoveOpen = async () => {
      if (!token) return;
      setBulkMoveModal(prev => ({ ...prev, isOpen: true, isLoadingFolders: true, search: '', selectedFolder: null }));
      try {
          const service = getDropboxService();
          const folders = await service.listAllFolders();
          setBulkMoveModal(prev => ({ ...prev, folders, isLoadingFolders: false }));
      } catch (err: any) {
          alert(`Error al cargar carpetas: ${err.message}`);
          setBulkMoveModal({ isOpen: false, isMoving: false, selectedFolder: null, folders: [], isLoadingFolders: false, search: '' });
      }
  };

  const handleBulkMove = async () => {
      const { selectedFolder } = bulkMoveModal;
      if (!selectedFolder || selectedFilePaths.size === 0) return;
      const count = selectedFilePaths.size;
      const targetBase = selectedFolder.path_lower || '';
      setBulkMoveModal(prev => ({ ...prev, isMoving: true }));
      try {
          const service = getDropboxService();
          const queue = (Array.from(selectedFilePaths) as string[]).slice();
          const errors: string[] = [];

          const moveWithRetry = async (srcPath: string) => {
              const fileName = srcPath.split('/').pop()!;
              const destPath = targetBase === '' ? `/${fileName}` : `${targetBase}/${fileName}`;
              let lastErr: any = null;
              for (let attempt = 0; attempt <= 6; attempt++) {
                  if (attempt > 0) {
                      // Honor Retry-After from Dropbox, then exponential: 15s, 30s, 60s, 120s…
                      const retryAfter = (lastErr?.retryAfter ?? 15) * Math.pow(2, attempt - 1);
                      await new Promise(r => setTimeout(r, Math.min(retryAfter * 1000, 120000)));
                  }
                  try {
                      await service.moveFile(srcPath, destPath);
                      return;
                  } catch (e: any) {
                      lastErr = e;
                      const isRateLimit = e.message?.includes('too_many_write') || e.message?.includes('429');
                      if (!isRateLimit) break;
                  }
              }
              errors.push(`${fileName}: ${parseUploadError(lastErr)}`);
          };

          // 1 sequential worker — Dropbox write-rate limit is per-user, concurrency compounds the problem
          for (const srcPath of queue) {
              await moveWithRetry(srcPath);
          }

          if (errors.length > 0) {
              alert(`${count - errors.length} archivos movidos. ${errors.length} con error:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n…' : ''}`);
          }
          await NotificationService.create('upload', `Movió ${count - errors.length} archivos a "${selectedFolder.name}"`, currentUser?.username || 'unknown');
          setSelectedFilePaths(new Set());
          setBulkMoveModal({ isOpen: false, isMoving: false, selectedFolder: null, folders: [], isLoadingFolders: false, search: '' });
          await refreshFiles();
      } catch (err: any) {
          alert(`Error al mover: ${err.message}`);
          setBulkMoveModal(prev => ({ ...prev, isMoving: false }));
      }
  };

  const handleMoveFileRequest = (sourceFile: DropboxFile, targetFolder: DropboxFile) => {
      console.log('[Move] Requested:', sourceFile.name, '→', targetFolder.name);
      setMoveModal({ isOpen: true, source: sourceFile, target: targetFolder, isMoving: false });
  };

  const handleMoveToBreadcrumb = (sourceFile: DropboxFile, targetPath: string, targetName: string) => {
      const syntheticTarget: DropboxFile = {
          id: `breadcrumb-${targetPath || 'root'}`,
          name: targetName,
          path_lower: targetPath,
          path_display: targetPath,
          '.tag': 'folder',
      };
      setMoveModal({ isOpen: true, source: sourceFile, target: syntheticTarget, isMoving: false });
  };

  const confirmMoveAction = async () => {
      const { source, target } = moveModal;
      if (!source || !target) return;
      if (!token) { alert('Sin conexión a Dropbox. Recarga la página.'); return; }
      const targetBase = target.path_lower || '';
      const newPath = targetBase === '' ? `/${source.name}` : `${targetBase}/${source.name}`;
      console.log('[Move] from:', source.path_lower, '→ to:', newPath);
      setMoveModal(prev => ({ ...prev, isMoving: true }));
      try {
          const service = getDropboxService();
          await service.moveFile(source.path_lower, newPath);

          // NOTIFY MOVE
          await NotificationService.create('upload', `Movió "${source.name}" a "${target.name}"`, currentUser?.username || 'unknown');

          setMoveModal({ isOpen: false, source: null, target: null, isMoving: false });
          // Navigate to destination so the user sees the moved item
          handleNavigate(targetBase);
      } catch (err: any) {
          console.error('[Move] Error:', err);
          alert(`Error al mover: ${err.message}`);
          setMoveModal(prev => ({ ...prev, isMoving: false }));
      }
  };

  const handleExcelSave = async (file: DropboxFile, blob: Blob) => {
      if (!token) return;
      try {
          const excelFile = new File([blob], file.name, { type: blob.type });
          const service = getDropboxService();
          await service.uploadFile('', excelFile, file.path_lower);
          await NotificationService.create('upload', `Editó archivo: ${file.name}`, currentUser?.username || 'unknown');
          await refreshFiles();
      } catch (err: any) {
          throw new Error(err.message ?? 'Error al guardar');
      }
  };

  const handleDownload = async (file: DropboxFile) => {
      if (!token) return;
      try {
          const service = getDropboxService();
          const link = await service.getTemporaryLink(file.path_lower);
          
          // NOTIFY DOWNLOAD
          await NotificationService.create('system', `Descargó archivo: ${file.name}`, currentUser?.username || 'unknown');
          
          const a = document.createElement('a'); a.href = link; a.download = file.name;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } catch (err: any) { alert('Error: ' + err.message); }
  };

  const doOpenLocal = async (file: DropboxFile) => {
      if (!token) return;
      try {
          const service = getDropboxService();
          const link = await service.getTemporaryLink(file.path_lower);
          const a = document.createElement('a');
          a.href = link;
          a.download = file.name;
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          await NotificationService.create('system', `Abrió archivo: ${file.name}`, currentUser?.username || 'unknown');
      } catch (err: any) { alert('Error al abrir: ' + err.message); }
  };

  const handleOpenLocal = async (file: DropboxFile) => {
      if (!token) return;
      const canEdit = currentUser ? getEffectivePermissions(file, currentUser).includes('write') : false;
      if (canEdit) {
          const { lock, blockedBy } = await FileLockService.acquire(
              file.path_lower, currentUser!.username, currentUser!.fullName
          );
          if (blockedBy) {
              setFileLockModal({ isOpen: true, file, blockedBy, context: 'local' });
              return;
          }
          if (lock) setMyActiveLocks(prev => ({ ...prev, [file.path_lower]: lock }));
      }
      await doOpenLocal(file);
  };

  const handleManualUploadClick = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true; 
    // Leave accept empty so ALL file types are shown in every browser
    // (accept="*" is invalid and some browsers filter files incorrectly)
    input.onchange = async (e: any) => { if (e.target.files.length) processFileUpload(e.target.files); };
    input.click();
  };

  const handleFolderUploadClick = async () => {
    if (!token) return;
    if (!canCreateFolderInPath(currentPath, currentUser)) {
        alert("No tienes permisos para subir archivos a esta carpeta.");
        return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.setAttribute('multiple', '');

    input.onchange = async (e: any) => {
        if (!e.target.files.length) return;

        const selectedFiles = Array.from(e.target.files) as File[];
        const folderName = selectedFiles[0]?.webkitRelativePath?.split('/')[0] || 'carpeta';
        const basePath = currentPath.replace(/\/+$/, '');
        const service = getDropboxService();

        // — Fetch existing Dropbox files recursively to detect duplicates —
        // Map: path_lower → size (so we can skip only if size matches — avoids treating damaged/0-byte files as complete)
        let existingFiles = new Map<string, number>();
        try {
            const existing = await service.listFiles(currentPath, true);
            existing.forEach(ef => { if (ef['.tag'] !== 'folder') existingFiles.set(ef.path_lower, ef.size ?? -1); });
        } catch { /* on error, proceed without skip detection */ }

        // Classify each file
        const toUpload: { file: File; idx: number }[] = [];
        const fileEntries = selectedFiles.map((f, idx) => {
            const expectedPath = ((basePath === '' ? '' : basePath) + '/' + f.webkitRelativePath).toLowerCase();
            const remoteSize = existingFiles.get(expectedPath);
            // Skip only when the file exists AND its remote size matches the local size (file is intact)
            if (remoteSize !== undefined && remoteSize > 0 && remoteSize === f.size) {
                return { name: f.webkitRelativePath || f.name, status: 'skipped' as const, newSize: f.size };
            }
            toUpload.push({ file: f, idx });
            return { name: f.webkitRelativePath || f.name, status: 'pending' as const, newSize: f.size };
        });

        const skippedCount = fileEntries.filter(f => f.status === 'skipped').length;
        const msg = skippedCount > 0
            ? `📁 "${folderName}": ${selectedFiles.length} archivos\n✅ ${skippedCount} ya subidos (se omitirán)\n📤 ${toUpload.length} por subir\n\n¿Continuar?`
            : `📁 "${folderName}": ${selectedFiles.length} archivos por subir\n\n¿Continuar?`;

        if (!confirm(msg)) return;

        setUploadProgress({ isOpen: true, folderName, files: fileEntries, current: 0, total: toUpload.length });
        setFailedFileObjects([]);

        if (toUpload.length === 0) {
            await refreshFiles();
            return;
        }

        const uploadedPaths: string[] = [];
        const failed: File[] = [];
        let completed = 0;
        const queue = [...toUpload];

        const folderWorker = async () => {
            while (true) {
                const item = queue.shift();
                if (!item) break;
                const { file, idx } = item;
                const fullPath = (basePath === '' ? '' : basePath) + '/' + file.webkitRelativePath;

                setUploadProgress(prev => {
                    const updated = [...prev.files];
                    updated[idx] = { ...updated[idx], status: 'uploading' };
                    return { ...prev, files: updated };
                });

                try {
                    const uploadedFile = await service.uploadFile(currentPath, file, fullPath);
                    uploadedPaths.push(uploadedFile.path_lower);
                    completed++;
                    setUploadProgress(prev => {
                        const updated = [...prev.files];
                        updated[idx] = { ...updated[idx], status: 'done' };
                        return { ...prev, files: updated, current: completed };
                    });
                } catch (err: any) {
                    console.error(`Error subiendo ${file.name}:`, err);
                    failed.push(file);
                    completed++;
                    const errorMsg = parseUploadError(err);
                    setUploadProgress(prev => {
                        const updated = [...prev.files];
                        updated[idx] = { ...updated[idx], status: 'error', errorMsg };
                        return { ...prev, files: updated, current: completed };
                    });
                }
            }
        };

        await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, toUpload.length) }, folderWorker));

        if (currentUser && currentUser.role !== 'admin' && uploadedPaths.length > 0) {
            try {
                const updatedUser = await MockAuthService.grantDeleteForUploadedFiles(currentUser.username, uploadedPaths);
                setCurrentUser(updatedUser);
            } catch (e) { console.error('Error al registrar permisos:', e); }
        }

        if (uploadedPaths.length > 0) {
            NotificationService.create('upload', `Subió carpeta: ${folderName} (${uploadedPaths.length} archivos)`, currentUser?.username || 'unknown').catch(console.error);
        }

        setFailedFileObjects(failed);
        await refreshFiles();

        if (!failed.length) {
            setTimeout(() => setUploadProgress({ isOpen: false, folderName: '', files: [], current: 0, total: 0 }), 1500);
        }
    };
    input.click();
  };

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  if (isAuthProcessing) return <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div><p className="text-gray-500 font-medium">Sincronizando conexión segura...</p></div>;
  if (!currentUser) return <LoginScreen onLogin={handleLogin} isLoading={isLoggingIn} error={loginError} />;
  
  if (currentUser.mustChangePassword) {
      return (
          <ForcePasswordChangeModal 
              user={currentUser} 
              onSuccess={(updatedUser) => {
                  setCurrentUser(updatedUser);
                  // Update local storage if needed, though login handles it usually.
                  // But if we update the user object, we might want to ensure persistence if we were using it.
                  // Current implementation uses 'ayala_current_user' just for username, so no change needed there.
              }} 
          />
      );
  }
  
  const folders = files.filter(f => f['.tag'] === 'folder');
  const regularFiles = files.filter(f => f['.tag'] !== 'folder');

  return (
    <div 
        className="flex h-screen w-screen bg-gray-100 font-sans text-gray-900 overflow-hidden relative"
        onDragOver={(e) => { e.preventDefault(); if (!internalDraggedFile && currentView === 'plans') setIsExternalDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); if (e.clientX === 0 && e.clientY === 0) setIsExternalDragging(false); }}
        onDrop={async (e) => { e.preventDefault(); setIsExternalDragging(false); if (e.dataTransfer.files.length > 0 && currentView === 'plans') await processFileUpload(e.dataTransfer.files); }}
    >
      {/* Modals */}
      {shareModalOpen.isOpen && shareModalOpen.file && (<ShareModal file={shareModalOpen.file} isOpen={shareModalOpen.isOpen} onClose={() => setShareModalOpen({file: null, isOpen: false})} currentShares={{}} onSave={() => {}} currentUser={currentUser} />)}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={handleDownload}
          getPreviewUrl={() => getDropboxService().getTemporaryLink(previewFile.path_lower)}
        />
      )}
      {excelEditFile && (
        <ExcelEditorModal
          file={excelEditFile}
          onClose={handleExcelClose}
          onDownload={handleDownload}
          getPreviewUrl={() => getDropboxService().getTemporaryLink(excelEditFile.path_lower)}
          onSave={handleExcelSave}
          canEdit={!excelReadOnly && (currentUser ? getEffectivePermissions(excelEditFile, currentUser).includes('write') : false)}
        />
      )}

      {/* File Lock Modal */}
      {fileLockModal.isOpen && fileLockModal.file && fileLockModal.blockedBy && (
          <FileLockModal
              fileName={fileLockModal.file.name}
              filePath={fileLockModal.file.path_lower}
              lock={fileLockModal.blockedBy}
              onCancel={() => setFileLockModal(prev => ({ ...prev, isOpen: false }))}
              onOpenReadOnly={() => {
                  const f = fileLockModal.file!;
                  const ctx = fileLockModal.context;
                  setFileLockModal(prev => ({ ...prev, isOpen: false }));
                  if (ctx === 'excel') {
                      setExcelReadOnly(true);
                      setExcelEditFile(f);
                  } else if (ctx === 'trabajos') {
                      doDownloadToTrabajos(f);
                  } else {
                      // 'local': open without acquiring lock — read-only intent
                      doOpenLocal(f);
                  }
              }}
              onEditAvailable={async () => {
                  const f = fileLockModal.file!;
                  const ctx = fileLockModal.context;
                  setFileLockModal(prev => ({ ...prev, isOpen: false }));
                  const { lock } = await FileLockService.acquire(
                      f.path_lower, currentUser!.username, currentUser!.fullName
                  );
                  if (lock) setMyActiveLocks(prev => ({ ...prev, [f.path_lower]: lock }));
                  if (ctx === 'excel') {
                      setExcelReadOnly(false);
                      setExcelEditFile(f);
                  } else if (ctx === 'trabajos') {
                      await doDownloadToTrabajos(f);
                  } else {
                      await doOpenLocal(f);
                  }
              }}
          />
      )}

      {/* Bulk Move Modal */}
      {bulkMoveModal.isOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col" style={{ maxHeight: '85vh' }}>
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                      <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <ArrowRight className="text-blue-600" size={18} />
                          </div>
                          <div>
                              <h3 className="text-base font-bold text-gray-900">Mover archivos</h3>
                              <p className="text-xs text-gray-500">{selectedFilePaths.size} archivo{selectedFilePaths.size > 1 ? 's' : ''} seleccionado{selectedFilePaths.size > 1 ? 's' : ''}</p>
                          </div>
                      </div>
                      <button onClick={() => setBulkMoveModal(prev => ({ ...prev, isOpen: false }))} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                          <X size={18} />
                      </button>
                  </div>

                  {/* Search */}
                  <div className="px-6 py-3 border-b border-gray-100 flex-shrink-0">
                      <input
                          type="text"
                          placeholder="Buscar carpeta..."
                          value={bulkMoveModal.search}
                          onChange={e => setBulkMoveModal(prev => ({ ...prev, search: e.target.value }))}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                  </div>

                  {/* Folder list */}
                  <div className="flex-1 overflow-y-auto px-3 py-2">
                      {bulkMoveModal.isLoadingFolders ? (
                          <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400">
                              <Loader2 className="animate-spin" size={24} />
                              <span className="text-sm">Cargando carpetas…</span>
                          </div>
                      ) : (
                          <>
                              {/* Root option */}
                              {(bulkMoveModal.search === '' || '/'.includes(bulkMoveModal.search.toLowerCase())) && (
                                  <button
                                      onClick={() => setBulkMoveModal(prev => ({ ...prev, selectedFolder: { id: 'root', name: '/ (Raíz)', path_lower: '', path_display: '/', '.tag': 'folder' } }))}
                                      className={`w-full flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-1 text-left transition-colors ${bulkMoveModal.selectedFolder?.id === 'root' ? 'bg-blue-100 text-blue-800 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}
                                  >
                                      <FolderIcon size={16} className="text-yellow-500 flex-shrink-0" />
                                      / (Raíz)
                                  </button>
                              )}
                              {bulkMoveModal.folders
                                  .filter(f => bulkMoveModal.search === '' || (f.path_display || f.name).toLowerCase().includes(bulkMoveModal.search.toLowerCase()))
                                  .map(folder => (
                                      <button
                                          key={folder.id}
                                          onClick={() => setBulkMoveModal(prev => ({ ...prev, selectedFolder: folder }))}
                                          className={`w-full flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-0.5 text-left transition-colors ${bulkMoveModal.selectedFolder?.id === folder.id ? 'bg-blue-100 text-blue-800 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}
                                      >
                                          <FolderIcon size={16} className="text-yellow-500 flex-shrink-0" />
                                          <span className="truncate" title={folder.path_display || folder.name}>{folder.path_display || folder.name}</span>
                                      </button>
                                  ))
                              }
                              {!bulkMoveModal.isLoadingFolders && bulkMoveModal.folders.filter(f => bulkMoveModal.search === '' || (f.path_display || f.name).toLowerCase().includes(bulkMoveModal.search.toLowerCase())).length === 0 && bulkMoveModal.search !== '' && (
                                  <p className="text-sm text-gray-400 text-center py-6">No se encontraron carpetas</p>
                              )}
                          </>
                      )}
                  </div>

                  {/* Footer */}
                  <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
                      <button
                          onClick={() => setBulkMoveModal({ isOpen: false, isMoving: false, selectedFolder: null, folders: [], isLoadingFolders: false, search: '' })}
                          disabled={bulkMoveModal.isMoving}
                          className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                      >
                          Cancelar
                      </button>
                      <button
                          onClick={handleBulkMove}
                          disabled={!bulkMoveModal.selectedFolder || bulkMoveModal.isMoving}
                          className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                      >
                          {bulkMoveModal.isMoving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                          {bulkMoveModal.isMoving ? 'Moviendo…' : 'Mover aquí'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Move Confirmation Modal */}
      {moveModal.isOpen && moveModal.source && moveModal.target && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
                  <div className="flex items-center mb-5">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3 flex-shrink-0">
                          <ArrowRight className="text-blue-600" size={20} />
                      </div>
                      <div>
                          <h3 className="text-lg font-bold text-gray-900">Mover elemento</h3>
                          <p className="text-sm text-gray-500">Se moverá en Dropbox</p>
                      </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3 border border-gray-100">
                      <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400 w-16 flex-shrink-0">Desde:</span>
                          <span className="font-medium text-gray-900 flex items-center gap-1.5 truncate">
                              {moveModal.source['.tag'] === 'folder'
                                  ? <FolderIcon size={14} className="text-yellow-500 flex-shrink-0" />
                                  : <FileText size={14} className="text-blue-500 flex-shrink-0" />}
                              {moveModal.source.name}
                          </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400 w-16 flex-shrink-0">Hacia:</span>
                          <span className="font-semibold text-blue-700 flex items-center gap-1.5 truncate">
                              <FolderIcon size={14} className="text-yellow-500 flex-shrink-0" />
                              {moveModal.target.name}
                          </span>
                      </div>
                  </div>
                  <div className="flex gap-3">
                      <button
                          onClick={() => setMoveModal({ isOpen: false, source: null, target: null, isMoving: false })}
                          disabled={moveModal.isMoving}
                          className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                      >
                          Cancelar
                      </button>
                      <button
                          onClick={confirmMoveAction}
                          disabled={moveModal.isMoving}
                          className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                      >
                          {moveModal.isMoving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                          {moveModal.isMoving ? 'Moviendo...' : 'Confirmar Mover'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Context Menu */}
      {contextMenu.isOpen && contextMenu.file && (
          <div
              className="fixed z-[200] bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[220px] select-none"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={e => e.stopPropagation()}
          >
              {contextMenu.file['.tag'] !== 'folder' ? (
                  <>
                      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Abrir / Editar con</div>
                          <div className={`text-sm font-semibold ${getEditorInfo(contextMenu.file.name).color}`}>
                              {getEditorInfo(contextMenu.file.name).name}
                          </div>
                      </div>
                      {/* Lock banner — shown when another user holds the lock */}
                      {contextMenu.lockedBy && (
                          <div className="mx-2 mt-1.5 mb-0.5 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                              <Lock size={12} className="text-red-500 flex-shrink-0" />
                              <div className="min-w-0">
                                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide leading-tight">Archivo bloqueado</p>
                                  <p className="text-xs text-red-800 font-semibold truncate">{contextMenu.lockedBy.locked_by_fullname}</p>
                              </div>
                          </div>
                      )}
                      <div className="py-1">
                          <button
                              className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-blue-50 flex items-center gap-2.5 transition-colors"
                              onClick={() => { handleOpenLocal(contextMenu.file!); setContextMenu(prev => ({ ...prev, isOpen: false })); }}>
                              <ExternalLink size={14} className="text-blue-500 shrink-0" />
                              <span>Abrir con {getEditorInfo(contextMenu.file.name).name}</span>
                          </button>
                          {contextMenu.canDownload && (
                              <button
                                  disabled={!!contextMenu.lockedBy}
                                  className={`w-full px-4 py-2 text-sm text-left flex items-center gap-2.5 transition-colors ${contextMenu.lockedBy ? 'opacity-40 cursor-not-allowed text-gray-400' : 'text-gray-700 hover:bg-green-50'}`}
                                  title={contextMenu.lockedBy ? `${contextMenu.lockedBy.locked_by_fullname} está editando este archivo` : undefined}
                                  onClick={() => { if (!contextMenu.lockedBy) { handleDownload(contextMenu.file!); setContextMenu(prev => ({ ...prev, isOpen: false })); } }}>
                                  <Download size={14} className={contextMenu.lockedBy ? 'text-gray-400 shrink-0' : 'text-green-500 shrink-0'} />
                                  <span>Descargar</span>
                              </button>
                          )}
                          {contextMenu.canDownload && (
                              <button
                                  disabled={!!contextMenu.lockedBy}
                                  className={`w-full px-4 py-2 text-sm text-left flex items-center gap-2.5 transition-colors ${contextMenu.lockedBy ? 'opacity-40 cursor-not-allowed text-gray-400' : 'text-gray-700 hover:bg-blue-50'}`}
                                  title={contextMenu.lockedBy ? `${contextMenu.lockedBy.locked_by_fullname} está editando este archivo` : undefined}
                                  onClick={() => { if (!contextMenu.lockedBy) { handleDownloadToTrabajos(contextMenu.file!); setContextMenu(prev => ({ ...prev, isOpen: false })); } }}>
                                  <Briefcase size={14} className={contextMenu.lockedBy ? 'text-gray-400 shrink-0' : 'text-blue-500 shrink-0'} />
                                  <span>Guardar en Trabajos</span>
                              </button>
                          )}
                      </div>
                      <div className="border-t border-gray-100" />
                  </>
              ) : (
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Carpeta</div>
                      <div className="text-sm font-semibold text-yellow-700">{contextMenu.file.name}</div>
                  </div>
              )}
              <div className="py-1">
                  <button
                      className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                      onClick={() => { setTagModalOpen({ file: contextMenu.file!, isOpen: true }); setContextMenu(prev => ({ ...prev, isOpen: false })); }}>
                      <Tag size={14} className="text-yellow-500 shrink-0" />
                      <span>Asignar etiqueta</span>
                  </button>
                  {contextMenu.canShare && (
                      <button
                          className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                          onClick={() => { setShareModalOpen({ file: contextMenu.file!, isOpen: true }); setContextMenu(prev => ({ ...prev, isOpen: false })); }}>
                          <Share2 size={14} className="text-blue-500 shrink-0" />
                          <span>Compartir</span>
                      </button>
                  )}
              </div>
              {(contextMenu.canRename || contextMenu.canDelete) && (
                  <>
                      <div className="border-t border-gray-100" />
                      <div className="py-1">
                          {contextMenu.canRename && (
                              <button
                                  className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-orange-50 flex items-center gap-2.5 transition-colors"
                                  onClick={() => { setRenameModal({ isOpen: true, folder: contextMenu.file!, isRenaming: false }); setContextMenu(prev => ({ ...prev, isOpen: false })); }}>
                                  <Pencil size={14} className="text-orange-500 shrink-0" />
                                  <span>Renombrar</span>
                              </button>
                          )}
                          {contextMenu.canDelete && (
                              <button
                                  className="w-full px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
                                  onClick={() => { handleDelete(contextMenu.file!); setContextMenu(prev => ({ ...prev, isOpen: false })); }}>
                                  <Trash2 size={14} className="shrink-0" />
                                  <span>Eliminar</span>
                              </button>
                          )}
                      </div>
                  </>
              )}
          </div>
      )}

      {/* Upload Progress Modal */}
      {uploadProgress.isOpen && (() => {
          const totalFiles   = uploadProgress.files.length;
          const skippedCount = uploadProgress.files.filter(f => f.status === 'skipped').length;
          const doneCount    = uploadProgress.files.filter(f => f.status === 'done').length;
          const errorCount   = uploadProgress.files.filter(f => f.status === 'error').length;
          const pendingCount = uploadProgress.files.filter(f => f.status === 'pending').length;
          const toUploadTotal = totalFiles - skippedCount;
          const allFinished  = !uploadProgress.files.some(f => f.status === 'uploading' || f.status === 'pending');
          const pct = toUploadTotal > 0 ? Math.round((doneCount + errorCount) / toUploadTotal * 100) : 100;
          const fmtKB = (b: number) => Math.abs(b) >= 1024 * 1024
              ? (b / (1024 * 1024)).toFixed(1) + ' MB'
              : (b / 1024).toFixed(1) + ' KB';
          return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

                  {/* Header */}
                  <div className="px-6 py-4 border-b border-gray-200">
                      <div className="flex items-center justify-between mb-1">
                          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                              <UploadCloud size={18} className="text-blue-600" />
                              {allFinished ? 'Subida completada' : 'Subiendo archivos…'}
                          </h3>
                          {uploadProgress.folderName && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-medium truncate max-w-[180px]">
                                  📁 {uploadProgress.folderName}
                              </span>
                          )}
                      </div>
                      {/* Metrics row */}
                      <div className="grid grid-cols-4 gap-2 mt-3">
                          <div className="bg-gray-50 rounded-lg p-2 text-center">
                              <div className="text-lg font-bold text-gray-800">{totalFiles}</div>
                              <div className="text-[10px] text-gray-500 leading-tight">Total<br/>seleccionados</div>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-2 text-center">
                              <div className="text-lg font-bold text-blue-700">{skippedCount}</div>
                              <div className="text-[10px] text-blue-600 leading-tight">Ya estaban<br/>en Dropbox</div>
                          </div>
                          <div className="bg-green-50 rounded-lg p-2 text-center">
                              <div className="text-lg font-bold text-green-700">{doneCount}</div>
                              <div className="text-[10px] text-green-600 leading-tight">Subidos<br/>ahora</div>
                          </div>
                          <div className={`rounded-lg p-2 text-center ${errorCount > 0 ? 'bg-red-50' : pendingCount > 0 ? 'bg-orange-50' : 'bg-gray-50'}`}>
                              <div className={`text-lg font-bold ${errorCount > 0 ? 'text-red-700' : pendingCount > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                                  {errorCount > 0 ? errorCount : pendingCount}
                              </div>
                              <div className={`text-[10px] leading-tight ${errorCount > 0 ? 'text-red-500' : 'text-orange-500'}`}>
                                  {errorCount > 0 ? 'Con\nerror' : 'Por\nsubir'}
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="px-6 py-3">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>{allFinished && errorCount === 0 ? '✓ Completado' : `${doneCount + errorCount} / ${toUploadTotal} archivos`}</span>
                          <span className="font-medium">{pct}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                              className={`h-full rounded-full transition-all duration-300 ${errorCount > 0 && allFinished ? 'bg-orange-500' : 'bg-blue-600'}`}
                              style={{ width: `${pct}%` }}
                          />
                      </div>
                  </div>

                  {/* File List */}
                  <div className="px-6 pb-2 max-h-64 overflow-y-auto">
                      <ul className="space-y-1">
                          {uploadProgress.files.map((f, i) => {
                              const diff = f.status === 'skipped' && f.oldSize !== undefined && f.newSize !== undefined
                                  ? f.newSize - f.oldSize : null;
                              return (
                                  <li key={i} className={`flex items-center text-sm py-1 px-2 rounded gap-2 ${f.status === 'skipped' ? 'opacity-50' : ''}`}>
                                      <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                                          {f.status === 'uploading' && (
                                              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                          )}
                                          {f.status === 'done' && (
                                              <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                              </svg>
                                          )}
                                          {f.status === 'error' && (
                                              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                              </svg>
                                          )}
                                          {f.status === 'pending' && (
                                              <div className="w-2 h-2 rounded-full bg-gray-300" />
                                          )}
                                          {f.status === 'skipped' && (
                                              <span className="text-gray-400 text-xs font-bold leading-none">—</span>
                                          )}
                                      </span>
                                      <span className={`truncate flex-1 ${
                                          f.status === 'error'    ? 'text-red-600' :
                                          f.status === 'done'     ? 'text-green-700' :
                                          f.status === 'uploading'? 'text-blue-700 font-medium' :
                                          f.status === 'skipped'  ? 'text-gray-400 line-through' :
                                          'text-gray-500'
                                      }`}>
                                          {f.name}
                                      </span>
                                      {f.status === 'error' && f.errorMsg && (
                                          <span className="flex-shrink-0 text-xs text-red-500 italic max-w-[180px] truncate" title={f.errorMsg}>
                                              {f.errorMsg}
                                          </span>
                                      )}
                                      {f.status === 'skipped' ? (
                                          <span className="flex-shrink-0 text-xs text-gray-400 italic">ya existe</span>
                                      ) : f.status !== 'error' && f.newSize !== undefined && (
                                          <span className="flex-shrink-0 text-xs font-mono text-gray-400">
                                              {fmtKB(f.newSize)}
                                          </span>
                                      )}
                                      {diff !== null && diff !== 0 && (
                                          <span className={`flex-shrink-0 text-xs px-1 rounded font-semibold ${diff > 0 ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                                              {diff > 0 ? '+' : ''}{fmtKB(diff)}
                                          </span>
                                      )}
                                  </li>
                              );
                          })}
                      </ul>
                  </div>

                  {/* Footer: REENVIAR + Cerrar */}
                  {allFinished && (
                      <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
                          {failedFileObjects.length > 0 && (
                              <button
                                  onClick={handleReenviar}
                                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                              >
                                  <UploadCloud size={15} />
                                  REENVIAR ({failedFileObjects.length})
                              </button>
                          )}
                          <button
                              onClick={() => { setUploadProgress({ isOpen: false, folderName: '', files: [], current: 0, total: 0 }); setFailedFileObjects([]); }}
                              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
                          >
                              Cerrar
                          </button>
                      </div>
                  )}
              </div>
          </div>
          );
      })()}

      <Sidebar currentView={currentView} onNavigate={setCurrentView} userRole={currentUser.role} />
      
      <div className="flex-1 flex flex-col h-full min-w-0">
        <TopBar 
            onSearch={(t) => console.log(t)} 
            onUpload={handleManualUploadClick}
            onFolderUpload={handleFolderUploadClick}
            dropboxConnected={!!token && !error}
            onConnectDropbox={initiateDropboxAuth}
            currentUser={currentUser}
            onLogout={handleLogout}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onRefresh={refreshFiles}
        />
        
        {currentView === 'users' ? (
             (currentUser.role === 'admin' || currentUser.role === 'jefe') ? <div className="flex-1 overflow-y-auto bg-gray-50"><UserManagement currentUser={currentUser} token={token} /></div> : 
             <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-gray-500"><Lock size={48} className="mb-4 text-gray-300" /><h2 className="text-xl font-bold text-gray-700">Acceso Restringido</h2></div>
        ) : currentView === 'settings' ? (
            <div className="flex-1 overflow-y-auto bg-gray-50">
                <UserSettings currentUser={currentUser} onUpdateUser={handleUserUpdate} />
            </div>
        ) : currentView === 'trabajos' ? (
            <div className="flex-1 overflow-y-auto bg-gray-50">
                <WorkspacePanel
                    items={trabajosItems}
                    dirHandle={trabajosDirHandle}
                    dirName={trabajosDirName}
                    onConfigureDir={handleConfigureTrabajosDir}
                    onSyncAll={handleSincronizarAll}
                    onRemove={handleRemoveFromTrabajos}
                    onFileSelected={handleSincronizarItem}
                    isSyncing={isTrabajosSyncing}
                    syncStatuses={trabajosSyncStatuses}
                    autoSyncEnabled={!!trabajosDirHandle}
                    lockedByMe={new Set(Object.keys(myActiveLocks))}
                    locksMap={trabajosLocks}
                    currentUsername={currentUser.username}
                />
            </div>
        ) : (
            <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
            
            <div className="flex items-center justify-between mb-6 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex items-center space-x-2 text-sm text-gray-600 overflow-x-auto">
                    <button
                        onClick={() => handleNavigate('')}
                        onDragOver={(e) => { if (internalDraggedFile && currentPath !== '') { e.preventDefault(); setDragOverBreadcrumb('__root__'); }}}
                        onDragLeave={() => setDragOverBreadcrumb(null)}
                        onDrop={(e) => { e.preventDefault(); setDragOverBreadcrumb(null); if (internalDraggedFile && currentPath !== '') handleMoveToBreadcrumb(internalDraggedFile, '', 'Inicio'); }}
                        className={`p-1.5 rounded transition-colors ${currentPath === '' ? 'text-blue-600 font-bold bg-blue-50' : ''} ${dragOverBreadcrumb === '__root__' ? 'bg-blue-100 ring-2 ring-blue-400 text-blue-700' : 'hover:bg-gray-100'}`}
                    ><Home size={16} /></button>
                    {breadcrumbs.map((part, index) => {
                        const fullPath = '/' + breadcrumbs.slice(0, index + 1).join('/');
                        const isLast = index === breadcrumbs.length - 1;
                        return (
                            <div key={index} className="flex items-center">
                                <ChevronRight size={14} className="text-gray-400 mx-1" />
                                <button
                                    onClick={() => handleNavigate(fullPath)}
                                    onDragOver={(e) => { if (internalDraggedFile && !isLast) { e.preventDefault(); setDragOverBreadcrumb(fullPath); }}}
                                    onDragLeave={() => setDragOverBreadcrumb(null)}
                                    onDrop={(e) => { e.preventDefault(); setDragOverBreadcrumb(null); if (internalDraggedFile && !isLast) handleMoveToBreadcrumb(internalDraggedFile, fullPath, part); }}
                                    className={`px-2 py-1 rounded transition-colors whitespace-nowrap ${dragOverBreadcrumb === fullPath ? 'bg-blue-100 ring-2 ring-blue-400 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
                                >{part}</button>
                            </div>
                        );
                    })}
                </div>
                
                <div className="flex items-center space-x-3">
                     <button 
                         key="create-folder"
                         onClick={handleCreateFolder} 
                         disabled={!canCreateFolderInPath(currentPath, currentUser)}
                         className={`text-gray-600 hover:text-blue-600 flex items-center text-xs font-semibold px-3 py-2 bg-gray-50 rounded hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-all ${
                             !canCreateFolderInPath(currentPath, currentUser) ? 'opacity-50 cursor-not-allowed' : ''
                         }`}
                         title={!canCreateFolderInPath(currentPath, currentUser) ? "No tienes permisos para crear carpetas aquí" : "Crear nueva carpeta"}
                     >
                        <FolderPlus size={16} className="mr-2" /> Nueva Carpeta
                     </button>

                     {/* Connection Status Badge */}
                     <button 
                         onClick={currentUser.role === 'admin' ? (!token ? initiateDropboxAuth : undefined) : undefined}
                         className={`text-xs px-2 py-1 rounded flex items-center border transition-all 
                             ${error 
                                ? 'text-red-600 bg-red-50 border-red-200 cursor-default' 
                                : (token 
                                    ? 'text-green-600 bg-green-100 border-green-200 cursor-default' 
                                    : (currentUser.role === 'admin' 
                                        ? 'text-orange-600 bg-orange-100 border-orange-200 hover:bg-orange-200 cursor-pointer animate-pulse' 
                                        : 'text-gray-500 bg-gray-100 border-gray-200 cursor-not-allowed'))}`}
                         title={token ? "Conexión Global Activa" : (currentUser.role === 'admin' ? "Conectar Dropbox" : "Esperando conexión del administrador")}
                     >
                         {error ? <AlertTriangle size={12} className="mr-1"/> : (token ? <CheckCircle size={12} className="mr-1"/> : (currentUser.role === 'admin' ? <Link2 size={12} className="mr-1"/> : <Shield size={12} className="mr-1" />))}
                         {error ? 'Error de Conexión' : (token ? 'Conectado (Global)' : (currentUser.role === 'admin' ? 'Conectar Ahora' : 'Sin Conexión'))}
                     </button>
                </div>
            </div>

            {isLoading && <div className="flex flex-col items-center justify-center py-20 opacity-60"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div><p className="text-sm text-gray-500">Cargando...</p></div>}
            
            {/* ALERT: ROOT FOLDER MISSING */}
            {isRootMissing && !isLoading && (
                <div className="mb-6 p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-center shadow-sm">
                    <div className="flex flex-col items-center">
                        <AlertTriangle className="text-yellow-600 h-10 w-10 mb-2" />
                        <h3 className="text-lg font-bold text-yellow-800">Carpeta Raíz No Encontrada</h3>
                        <p className="text-sm text-yellow-700 mt-1 max-w-lg">
                            La carpeta configurada <code>{CONFIG_ROOT}</code> no existe en el Dropbox conectado.
                        </p>
                        
                        {currentUser.role === 'admin' ? (
                             <div className="flex space-x-3 mt-4">
                                <button 
                                    onClick={createRootStructure}
                                    className="bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-yellow-700 flex items-center shadow-sm"
                                >
                                    <Wrench size={16} className="mr-2" /> Crear Automáticamente
                                </button>
                                <button 
                                    onClick={() => setCurrentPath('')}
                                    className="bg-white text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 border border-gray-300"
                                >
                                    Ir a la Raíz de Dropbox (/)
                                </button>
                             </div>
                        ) : (
                            <p className="text-xs text-yellow-600 mt-2 font-bold">Contacte al Administrador para inicializar el repositorio.</p>
                        )}
                    </div>
                </div>
            )}
            
            {!isLoading && !error && !isRootMissing && (
                <>
                {viewMode === 'list' ? (
                     <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                                        <input
                                            type="checkbox"
                                            checked={regularFiles.length > 0 && regularFiles.every(f => selectedFilePaths.has(f.path_lower))}
                                            onChange={(e) => setSelectedFilePaths(e.target.checked ? new Set(regularFiles.map(f => f.path_lower)) : new Set())}
                                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                                            title="Seleccionar todos los archivos"
                                        />
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tamaño</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modificado</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hora de Actualización</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Etiquetas</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {folders.map(folder => {
                                    const perms = getEffectivePermissions(folder, currentUser);
                                    const canShare = currentUser.role === 'admin' || (currentUser.role === 'jefe' && perms.includes('write')); 
                                    return <PlanListItem key={folder.id} file={folder} onClick={handleCardClick} onDragStart={(f) => setInternalDraggedFile(f)} onDragEnd={() => { setInternalDraggedFile(null); setDragOverBreadcrumb(null); }} onDelete={handleDelete} onRename={handleRenameFolder} onAssignTag={(f) => setTagModalOpen({file: f, isOpen: true})} onMove={handleMoveFileRequest} onShare={canShare ? (f) => setShareModalOpen({file: f, isOpen: true}) : undefined} onContextMenuOpen={handleContextMenuOpen} draggedFile={internalDraggedFile} canDelete={perms.includes('delete')} canRename={canRenameFolder(folder, currentUser)} effectivePermissions={perms} allTags={availableTags} />;
                                })}
                                {regularFiles.map(file => {
                                    const perms = getEffectivePermissions(file, currentUser);
                                    const canShare = currentUser.role === 'admin' || (currentUser.role === 'jefe' && perms.includes('write'));
                                    return <PlanListItem key={file.id} file={file} onClick={handleCardClick} onDragStart={(f) => setInternalDraggedFile(f)} onDragEnd={() => { setInternalDraggedFile(null); setDragOverBreadcrumb(null); }} onDelete={handleDelete} onAssignTag={(f) => setTagModalOpen({file: f, isOpen: true})} onShare={canShare ? (f) => setShareModalOpen({file: f, isOpen: true}) : undefined} onContextMenuOpen={handleContextMenuOpen} canDelete={perms.includes('delete')} effectivePermissions={perms} allTags={availableTags} sharedWithCount={0} selected={selectedFilePaths.has(file.path_lower)} onSelect={(f, e) => { e.stopPropagation(); setSelectedFilePaths(prev => { const next = new Set(prev); next.has(f.path_lower) ? next.delete(f.path_lower) : next.add(f.path_lower); return next; }); }} />;
                                })}
                            </tbody>
                        </table>
                     </div>
                ) : (
                    <>
                    {folders.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Carpetas</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {folders.map(folder => {
                                    const perms = getEffectivePermissions(folder, currentUser);
                                    const canShare = currentUser.role === 'admin' || (currentUser.role === 'jefe' && perms.includes('write')); 
                                    return <PlanCard key={folder.id} file={folder} onClick={handleCardClick} onDragStart={(f) => setInternalDraggedFile(f)} onDragEnd={() => { setInternalDraggedFile(null); setDragOverBreadcrumb(null); }} onDelete={handleDelete} onRename={handleRenameFolder} onAssignTag={(f) => setTagModalOpen({file: f, isOpen: true})} onMove={handleMoveFileRequest} onShare={canShare ? (f) => setShareModalOpen({file: f, isOpen: true}) : undefined} onContextMenuOpen={handleContextMenuOpen} draggedFile={internalDraggedFile} canDelete={perms.includes('delete')} canRename={canRenameFolder(folder, currentUser)} effectivePermissions={perms} allTags={availableTags} />;
                                })}
                            </div>
                        </div>
                    )}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Archivos ({regularFiles.length})</h3>
                            {regularFiles.length > 0 && (
                                <button
                                    onClick={() => {
                                        const allSelected = regularFiles.every(f => selectedFilePaths.has(f.path_lower));
                                        setSelectedFilePaths(allSelected ? new Set() : new Set(regularFiles.map(f => f.path_lower)));
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline"
                                >
                                    {regularFiles.length > 0 && regularFiles.every(f => selectedFilePaths.has(f.path_lower)) ? 'Deseleccionar todo' : 'Seleccionar todo'}
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {regularFiles.map((file) => {
                                const perms = getEffectivePermissions(file, currentUser);
                                const canShare = currentUser.role === 'admin' || (currentUser.role === 'jefe' && (perms.includes('write') || perms.includes('read')));
                                return <PlanCard key={file.id} file={file} onClick={handleCardClick} onDragStart={(f) => setInternalDraggedFile(f)} onDragEnd={() => { setInternalDraggedFile(null); setDragOverBreadcrumb(null); }} onDelete={handleDelete} onAssignTag={(f) => setTagModalOpen({file: f, isOpen: true})} onShare={canShare ? (f) => setShareModalOpen({file: f, isOpen: true}) : undefined} onContextMenuOpen={handleContextMenuOpen} canDelete={perms.includes('delete')} effectivePermissions={perms} allTags={availableTags} sharedWithCount={0} selected={selectedFilePaths.has(file.path_lower)} onSelect={(f, e) => { e.stopPropagation(); setSelectedFilePaths(prev => { const next = new Set(prev); next.has(f.path_lower) ? next.delete(f.path_lower) : next.add(f.path_lower); return next; }); }} />;
                            })}
                            <AddPlanCard onClick={handleManualUploadClick} />
                        </div>
                    </div>
                    </>
                )}
                </>
            )}
            
            {/* Empty State Prompt */}
            {!token && !isLoading && (
                <div className="mt-10 p-6 border-2 border-dashed border-gray-300 rounded-lg text-center bg-gray-50">
                    <p className="text-gray-500 mb-2 font-medium">⚠️ No se detectó conexión global con Dropbox.</p>
                    {currentUser.role === 'admin' ? (
                        <>
                            <p className="text-gray-400 text-sm mb-4">Como administrador, debes conectar la cuenta para que todos los usuarios tengan acceso.</p>
                            <button 
                                onClick={initiateDropboxAuth}
                                className="text-white bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-full font-bold shadow-lg transition-transform active:scale-95 flex items-center justify-center mx-auto"
                            >
                                <Link2 size={18} className="mr-2"/> Conectar Dropbox Oficial
                            </button>
                        </>
                    ) : (
                        <div className="bg-orange-50 text-orange-700 p-4 rounded inline-block text-sm">
                            <p className="font-bold mb-1">Esperando al Administrador</p>
                            <p>El sistema requiere que el administrador principal conecte el repositorio.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Floating bulk-action bar */}
            {selectedFilePaths.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white shadow-xl border border-gray-200 rounded-full px-5 py-3 z-40">
                    <span className="text-sm text-gray-700 font-medium">{selectedFilePaths.size} archivo{selectedFilePaths.size > 1 ? 's' : ''} seleccionado{selectedFilePaths.size > 1 ? 's' : ''}</span>
                    <button
                        onClick={handleBulkMoveOpen}
                        className="flex items-center gap-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-full transition-colors"
                    >
                        <ArrowRight size={14} /> Mover
                    </button>
                    <button
                        onClick={handleBulkDelete}
                        className="flex items-center gap-1.5 text-sm text-white bg-red-600 hover:bg-red-700 px-4 py-1.5 rounded-full transition-colors"
                    >
                        <Trash2 size={14} /> Eliminar
                    </button>
                    <button
                        onClick={() => setSelectedFilePaths(new Set())}
                        className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            )}

            <div className="h-20"></div>
            </div>
        )}
      </div>
    </div>
  );
};

export default App;