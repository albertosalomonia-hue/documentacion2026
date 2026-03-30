import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import PlanCard, { AddPlanCard, PlanListItem } from './components/PlanCard';
import LoginScreen from './components/LoginScreen';
import FilePreviewModal from './components/FilePreviewModal';
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal';
import UserManagement from './components/UserManagement';
import UserSettings from './components/UserSettings';
import ShareModal from './components/ShareModal';
import { DropboxFile, PlanGroup, User, FileTag, PermissionType } from './types';
import { DropboxService, getDropboxAuthUrl, parseAuthTokenFromUrl, parseAuthCodeFromUrl } from './services/dropboxService';
import { MockAuthService } from './services/mockAuth';
import { NotificationService } from './services/notificationService';
import { UploadCloud, CheckCircle, AlertTriangle, RefreshCw, Trash2, Lock, ShieldAlert, FolderPlus, Home, ChevronRight, Tag, Plus, X, ArrowRight, FileText, Folder as FolderIcon, Loader2, Link2, Shield, Wrench } from 'lucide-react';

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
  const [previewFile, setPreviewFile] = useState<DropboxFile | null>(null);

  const [moveModal, setMoveModal] = useState<{
      isOpen: boolean;
      source: DropboxFile | null;
      target: DropboxFile | null;
      isMoving: boolean;
  }>({ isOpen: false, source: null, target: null, isMoving: false });

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
        // NOTIFY LOGOUT (Optional, but good for "movements")
        NotificationService.create('system', `Usuario cerró sesión: ${currentUser.username}`, currentUser.username);
    }
    setCurrentUser(null);
    setFiles([]);
    setCurrentView('plans');
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

  const handleNavigate = (path: string) => {
      if (isRestrictedPath(path)) {
          alert("Acceso denegado: Esta carpeta del sistema está restringida.");
          return;
      }
      setCurrentPath(path);
  };

  const handleCardClick = (file: DropboxFile) => {
      if (file['.tag'] === 'folder') {
          handleNavigate(file.path_lower);
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
      
      const folderName = prompt("Nombre de la nueva carpeta:");
      if (!folderName) return;

      const newFolderPath = `${currentPath}/${folderName}`.toLowerCase();
      if (isRestrictedPath(newFolderPath)) { alert("Nombre restringido."); return; }

      try {
          setIsLoading(true);
          const service = getDropboxService();
          await service.createFolder(`${currentPath}/${folderName}`);

          // NOTIFY
          await NotificationService.create('upload', `Creó carpeta: ${folderName}`, currentUser?.username || 'unknown');

          await refreshFiles();
      } catch (err: any) {
          alert("Error: " + err.message);
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

  const processFileUpload = async (files: FileList | File[]) => {
    if (!token) { alert("Sin conexión a Dropbox."); return; }
    setIsLoading(true);
    const service = getDropboxService();
    let successCount = 0;
    try {
        const fileArray = Array.from(files);
        for (const file of fileArray) {
            try { 
                await service.uploadFile(currentPath, file); 
                successCount++; 
                // NOTIFY
                await NotificationService.create('upload', `Subió archivo: ${file.name}`, currentUser?.username || 'unknown');
            } catch (err) { console.error(err); }
        }
        await refreshFiles(); 
        if(successCount > 0) console.log("Upload success");
    } catch (err: any) {
        alert(`Error al subir: ${err.message}`);
    } finally {
        setIsLoading(false);
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

  const handleMoveFileRequest = (sourceFile: DropboxFile, targetFolder: DropboxFile) => {
      setMoveModal({ isOpen: true, source: sourceFile, target: targetFolder, isMoving: false });
  };

  const confirmMoveAction = async () => {
      const { source, target } = moveModal;
      if (!source || !target || !token) return;
      const newPath = `${target.path_lower}/${source.name}`;
      setMoveModal(prev => ({ ...prev, isMoving: true }));
      try {
          const service = getDropboxService();
          await service.moveFile(source.path_lower, newPath);
          
          // NOTIFY MOVE
          await NotificationService.create('upload', `Movió "${source.name}" a "${target.name}"`, currentUser?.username || 'unknown');
          
          await refreshFiles();
          setMoveModal({ isOpen: false, source: null, target: null, isMoving: false });
      } catch (err: any) {
          alert(`Error: ${err.message}`);
          setMoveModal(prev => ({ ...prev, isMoving: false }));
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

  const handleManualUploadClick = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true; 
    input.accept = '*';
    input.onchange = async (e: any) => { if (e.target.files.length) processFileUpload(e.target.files); };
    input.click();
  };

  const handleFolderUploadClick = async () => {
    if (!token) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', ''); input.setAttribute('directory', ''); input.setAttribute('multiple', '');
    input.onchange = async (e: any) => {
        if (!e.target.files.length) return;
        setIsLoading(true);
        try {
            const service = getDropboxService();
            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];
                if (file.webkitRelativePath) {
                   await service.uploadFile(currentPath, file, [currentPath === '/' ? '' : currentPath, file.webkitRelativePath].join('/'));
                }
            }
            await refreshFiles();
        } catch (err: any) { alert(`Error: ${err.message}`); } finally { setIsLoading(false); }
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
      {/* Modals omitted for brevity */}
      {shareModalOpen.isOpen && shareModalOpen.file && (<ShareModal file={shareModalOpen.file} isOpen={shareModalOpen.isOpen} onClose={() => setShareModalOpen({file: null, isOpen: false})} currentShares={{}} onSave={() => {}} currentUser={currentUser} />)}
      {previewFile && <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} onDownload={handleDownload} />}

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
        ) : (
            <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
            
            <div className="flex items-center justify-between mb-6 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex items-center space-x-2 text-sm text-gray-600 overflow-x-auto">
                    <button onClick={() => handleNavigate('')} className={`p-1.5 rounded hover:bg-gray-100 ${currentPath === '' ? 'text-blue-600 font-bold bg-blue-50' : ''}`}><Home size={16} /></button>
                    {breadcrumbs.map((part, index) => {
                        const fullPath = '/' + breadcrumbs.slice(0, index + 1).join('/');
                        return (
                            <div key={index} className="flex items-center">
                                <ChevronRight size={14} className="text-gray-400 mx-1" />
                                <button onClick={() => handleNavigate(fullPath)} className="hover:bg-gray-100 px-2 py-1 rounded transition-colors whitespace-nowrap">{part}</button>
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
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tamaño</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modificado</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Etiquetas</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {folders.map(folder => {
                                    const perms = getEffectivePermissions(folder, currentUser);
                                    const canShare = currentUser.role === 'admin' || (currentUser.role === 'jefe' && perms.includes('write')); 
                                    return <PlanListItem key={folder.id} file={folder} onClick={handleCardClick} onDragStart={(f) => setInternalDraggedFile(f)} onDragEnd={() => setInternalDraggedFile(null)} onDelete={handleDelete} onAssignTag={(f) => setTagModalOpen({file: f, isOpen: true})} onMove={handleMoveFileRequest} onShare={canShare ? (f) => setShareModalOpen({file: f, isOpen: true}) : undefined} draggedFile={internalDraggedFile} canDelete={perms.includes('delete')} effectivePermissions={perms} allTags={availableTags} />;
                                })}
                                {regularFiles.map(file => {
                                    const perms = getEffectivePermissions(file, currentUser);
                                    const canShare = currentUser.role === 'admin' || (currentUser.role === 'jefe' && perms.includes('write')); 
                                    return <PlanListItem key={file.id} file={file} onClick={handleCardClick} onDragStart={(f) => setInternalDraggedFile(f)} onDragEnd={() => setInternalDraggedFile(null)} onDelete={handleDelete} onAssignTag={(f) => setTagModalOpen({file: f, isOpen: true})} onShare={canShare ? (f) => setShareModalOpen({file: f, isOpen: true}) : undefined} canDelete={perms.includes('delete')} effectivePermissions={perms} allTags={availableTags} sharedWithCount={0} />;
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
                                    return <PlanCard key={folder.id} file={folder} onClick={handleCardClick} onDragStart={(f) => setInternalDraggedFile(f)} onDragEnd={() => setInternalDraggedFile(null)} onDelete={handleDelete} onAssignTag={(f) => setTagModalOpen({file: f, isOpen: true})} onMove={handleMoveFileRequest} onShare={canShare ? (f) => setShareModalOpen({file: f, isOpen: true}) : undefined} draggedFile={internalDraggedFile} canDelete={perms.includes('delete')} effectivePermissions={perms} allTags={availableTags} />;
                                })}
                            </div>
                        </div>
                    )}
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Archivos ({regularFiles.length})</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {regularFiles.map((file) => {
                                const perms = getEffectivePermissions(file, currentUser);
                                const canShare = currentUser.role === 'admin' || (currentUser.role === 'jefe' && (perms.includes('write') || perms.includes('read'))); 
                                return <PlanCard key={file.id} file={file} onClick={handleCardClick} onDragStart={(f) => setInternalDraggedFile(f)} onDragEnd={() => setInternalDraggedFile(null)} onDelete={handleDelete} onAssignTag={(f) => setTagModalOpen({file: f, isOpen: true})} onShare={canShare ? (f) => setShareModalOpen({file: f, isOpen: true}) : undefined} canDelete={perms.includes('delete')} effectivePermissions={perms} allTags={availableTags} sharedWithCount={0} />;
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

            <div className="h-20"></div>
            </div>
        )}
      </div>
    </div>
  );
};

export default App;