import React, { useState, useEffect, useRef } from 'react';
import { User, FolderPermission, DropboxFile, PermissionType } from '../types';
import { MockAuthService } from '../services/mockAuth';
import { DropboxService } from '../services/dropboxService';
import { NotificationService } from '../services/notificationService';
import { Plus, Trash2, Shield, User as UserIcon, Check, X, Folder, AlertCircle, RefreshCw, Camera, Edit2, Users, UploadCloud, Download } from 'lucide-react';

interface UserManagementProps {
  currentUser: User;
  token?: string;
}

const RESTRICTED_SYSTEM_PATHS = ['/sistemcpe', '/sistemcotizacion', '/sistemdocfact', '/sistemacotizaciones', '/sistemcotizaciones'];

const UserManagement: React.FC<UserManagementProps> = ({ currentUser, token }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Local state to track managed users (updates immediately on creation without page refresh)
  const [localManagedUsers, setLocalManagedUsers] = useState<string[]>([]);

  // Dynamic Folder Options State
  const [folderOptions, setFolderOptions] = useState<{label: string, path: string}[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  // Form State
  const [editingUser, setEditingUser] = useState<User | null>(null); 
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'jefe' | 'user'>('user');
  const [newAvatar, setNewAvatar] = useState<string | null>(null);
  
  // Changed from simple string array to a map of permissions
  const [folderPermissions, setFolderPermissions] = useState<Record<string, PermissionType[]>>({});
  
  const [managedUsersSelection, setManagedUsersSelection] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Initialize local state from prop
    setLocalManagedUsers(currentUser.managedUsers || []);
  }, [currentUser]);

  useEffect(() => {
    loadUsers();
  }, [localManagedUsers]); // Reload when managed users list changes locally

  useEffect(() => {
      if (isModalOpen) {
          fetchFolderOptions();
      }
  }, [isModalOpen, token]);

  const fetchFolderOptions = async () => {
      setLoadingFolders(true);
      try {
          // If Admin, show root option. If Jefe, show nothing initially.
          let options = currentUser.role === 'admin' ? [{ label: '📂 REPOSITORIO COMPLETO (Raíz)', path: '/' }] : [];

          if (token) {
              const service = new DropboxService(token);
              // Use listAllFolders to get recursive structure
              // Attempt to fetch from Root to ensure we see everything
              const folders = await service.listAllFolders();
              
              const mappedFolders = folders
                  .filter(f => !RESTRICTED_SYSTEM_PATHS.some(restricted => f.path_lower.startsWith(restricted)))
                  .map(f => ({
                      label: f.path_display || f.name, // Show full path (e.g. /Folder/Subfolder)
                      path: f.path_lower
                  }))
                  .sort((a, b) => a.path.localeCompare(b.path)); // Sort alphabetically
              
              // Filter logic:
              // Admin sees all folders.
              // Jefe sees ONLY folders contained in their allowedFolders list (or subfolders of them).
              let availableFolders = mappedFolders;
              
              if (currentUser.role === 'jefe') {
                  const allowedPaths = currentUser.allowedFolders?.map(af => af.pathPrefix.toLowerCase()) || [];
                  // Also include root '/' if they have it, though unlikely for restrictiveness
                  const hasRoot = allowedPaths.includes('/');

                  if (!hasRoot) {
                      availableFolders = mappedFolders.filter(f => 
                          allowedPaths.some(allowed => 
                              f.path === allowed || f.path.startsWith(allowed + '/')
                          )
                      );
                  }
              }

              setFolderOptions([...options, ...availableFolders]);
          } else {
             // NO TOKEN -> NO FOLDERS (Removed Demo Data)
             setFolderOptions([...options]);
          }
      } catch (err) {
          console.error("Error fetching folders for permissions", err);
          // Fallback options in case API fails
          setFolderOptions([{ label: 'Todo el Repositorio (Admin)', path: '/' }]);
      } finally {
          setLoadingFolders(false);
      }
  };

  const loadUsers = async () => {
    try {
        const list = await MockAuthService.getUsers();
        
        // FILTERING LOGIC:
        // Admin: Sees everyone.
        // Jefe: Sees only users in their 'managedUsers' list.
        
        if (currentUser.role === 'jefe') {
            const subordinates = list.filter(u => localManagedUsers.includes(u.username));
            setUsers(subordinates);
        } else {
            setUsers(list);
        }
    } catch (e) {
        console.error("Failed to load users", e);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              setNewAvatar(reader.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  const openCreateModal = () => {
      setEditingUser(null);
      resetForm();
      // Enforce role for Jefe
      if (currentUser.role === 'jefe') {
          setNewRole('user');
      }
      setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
      setEditingUser(user);
      setNewUsername(user.username);
      setNewFullName(user.fullName);
      setNewRole(user.role);
      setNewAvatar(user.avatarUrl || null);
      setNewPassword(''); 
      
      // Load existing permissions into the map state
      const permsMap: Record<string, PermissionType[]> = {};
      user.allowedFolders?.forEach(fp => {
          permsMap[fp.pathPrefix] = fp.permissions;
      });
      setFolderPermissions(permsMap);

      setManagedUsersSelection(user.managedUsers || []);
      setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const paths = Object.keys(folderPermissions);
    
    if (paths.length === 0 && newRole !== 'admin') {
        if(!confirm("No has seleccionado ninguna carpeta. Este usuario podrá entrar pero no verá archivos. ¿Continuar?")) {
            return;
        }
    }

    setIsLoading(true);
    setSuccessMsg(null);

    try {
      // Construct the FolderPermission[] from our state map
      const permissions: FolderPermission[] = paths.map(path => ({
        pathPrefix: path,
        permissions: folderPermissions[path]
      }));

      let finalAvatarUrl = newAvatar;
      if (!finalAvatarUrl) {
           finalAvatarUrl = editingUser ? (editingUser.avatarUrl || `https://i.pravatar.cc/150?u=${newUsername}`) : `https://i.pravatar.cc/150?u=${newUsername}`;
      }

      const userData: Partial<User> = {
          fullName: newFullName,
          role: newRole,
          avatarUrl: finalAvatarUrl,
          allowedFolders: permissions,
          managedUsers: newRole === 'jefe' ? managedUsersSelection : []
      };

      if (editingUser) {
          await MockAuthService.updateUser(editingUser.username, userData, newPassword);
          setSuccessMsg(`Usuario ${newUsername} actualizado`);
          
          // NOTIFY PERMISSION CHANGE
          await NotificationService.create('permission', `Actualizó permisos de usuario: ${newUsername}`, currentUser.username);
      } else {
          // CREATE NEW USER
          const newUser: User = {
            id: `u-${Date.now()}`,
            username: newUsername,
            ...userData as any
          };
          await MockAuthService.createUser(newUser, newPassword);
          setSuccessMsg(`Usuario ${newUsername} creado correctamente`);
          
          // NOTIFY CREATION
          await NotificationService.create('system', `Creó nuevo usuario: ${newUsername}`, currentUser.username);

          // SPECIAL LOGIC FOR JEFE:
          // If a Jefe creates a user, that user must be associated with the Jefe immediately.
          if (currentUser.role === 'jefe') {
              const newManagedList = [...localManagedUsers, newUser.username];
              
              // 1. Update Jefe in DB
              await MockAuthService.updateUser(currentUser.username, {
                  managedUsers: newManagedList
              });

              // 2. Update local state to reflect change immediately in UI (loadUsers depends on this)
              setLocalManagedUsers(newManagedList);
          }
      }
      
      await loadUsers();
      
      setTimeout(() => {
          setIsModalOpen(false);
          setSuccessMsg(null);
          resetForm();
      }, 1500);

    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (username === currentUser.username) {
      alert("No puedes borrarte a ti mismo.");
      return;
    }
    if (confirm(`¿Eliminar usuario ${username}?`)) {
      await MockAuthService.deleteUser(username);
      
      // If Jefe deletes a user, remove from local managed list
      if (currentUser.role === 'jefe') {
          const newList = localManagedUsers.filter(u => u !== username);
          await MockAuthService.updateUser(currentUser.username, { managedUsers: newList });
          setLocalManagedUsers(newList);
      } else {
          loadUsers();
      }
    }
  };

  const resetForm = () => {
    setNewUsername('');
    setNewPassword('');
    setNewFullName('');
    setNewRole('user');
    setNewAvatar(null);
    setFolderPermissions({});
    setManagedUsersSelection([]);
  };

  // Toggle inclusion of the path. Default to Read only when adding.
  const togglePath = (path: string) => {
    setFolderPermissions(prev => {
        const next = { ...prev };
        if (next[path]) {
            delete next[path];
        } else {
            // Default permission when checking a folder: READ ONLY
            next[path] = ['read'];
        }
        return next;
    });
  };

  // Toggle specific permissions for a path
  const togglePermission = (path: string, type: PermissionType) => {
      setFolderPermissions(prev => {
          const currentPerms = prev[path] || [];
          let newPerms: PermissionType[];
          
          if (currentPerms.includes(type)) {
              newPerms = currentPerms.filter(p => p !== type);
          } else {
              newPerms = [...currentPerms, type];
          }

          // Ensure 'read' is always present if the folder is selected
          if (!newPerms.includes('read')) newPerms.push('read');

          return { ...prev, [path]: newPerms };
      });
  };

  const toggleManagedUser = (username: string) => {
      if (managedUsersSelection.includes(username)) {
          setManagedUsersSelection(prev => prev.filter(u => u !== username));
      } else {
          setManagedUsersSelection(prev => [...prev, username]);
      }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                <Shield className="mr-3 text-blue-600" /> Gestión de Usuarios y Permisos
            </h2>
            <p className="text-gray-500 mt-1">Administra roles, accesos y jerarquías.</p>
        </div>
        <button 
            onClick={openCreateModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center shadow-lg transition-transform active:scale-95"
        >
            <Plus size={18} className="mr-2" /> Nuevo Usuario
        </button>
      </div>

      {users.length === 0 && (
          <div className="bg-white p-10 rounded-xl text-center shadow-sm border border-gray-100">
              <UserIcon className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <h3 className="text-lg font-medium text-gray-900">No se encontraron usuarios</h3>
              <p className="text-gray-500">
                  {currentUser.role === 'jefe' 
                    ? 'No tienes usuarios asignados bajo tu cargo.' 
                    : 'No hay usuarios en el sistema.'}
              </p>
          </div>
      )}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {users.map(user => (
          <div key={user.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative group">
            <div className="flex items-center mb-4">
              <img src={user.avatarUrl} alt={user.username} className="w-12 h-12 rounded-full mr-4 border-2 border-gray-100 object-cover" />
              <div>
                <h3 className="font-bold text-gray-800">{user.fullName}</h3>
                <div className="flex items-center text-xs text-gray-500 mt-1">
                    <span className={`w-2 h-2 rounded-full mr-2 ${user.role === 'admin' ? 'bg-purple-500' : (user.role === 'jefe' ? 'bg-blue-500' : 'bg-green-500')}`}></span>
                    @{user.username} • {user.role === 'jefe' ? 'JEFE/GESTOR' : user.role.toUpperCase()}
                </div>
              </div>
            </div>
            
            <div className="border-t border-gray-100 pt-3 space-y-2">
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Carpetas Asignadas:</p>
                    <div className="flex flex-col gap-2 mt-1">
                        {user.allowedFolders?.map((f, idx) => {
                            const hasWrite = f.permissions.includes('write');
                            const hasDelete = f.permissions.includes('delete');
                            const displayPath = f.pathPrefix === '/' ? '📂 Repositorio Completo' : `📂 ${f.pathPrefix}`;

                            return (
                                <div key={idx} className="flex flex-col bg-blue-50 text-blue-900 text-sm px-3 py-2 rounded-lg border border-blue-200 relative shadow-sm">
                                    <div className="flex items-start mb-1">
                                        <Folder className="text-blue-500 mr-2 mt-0.5 flex-shrink-0" size={16} />
                                        <span className="font-bold break-all leading-tight" title={f.pathPrefix}>
                                            {displayPath}
                                        </span>
                                    </div>
                                    <div className="flex space-x-2 mt-1 ml-6">
                                        {hasWrite && (
                                            <span className="flex items-center text-[10px] text-blue-700 bg-white px-1.5 py-0.5 rounded border border-blue-200" title="Subir/Crear">
                                                <UploadCloud size={10} className="mr-1"/> Subir
                                            </span>
                                        )}
                                        {hasDelete && (
                                            <span className="flex items-center text-[10px] text-red-700 bg-white px-1.5 py-0.5 rounded border border-red-200" title="Eliminar">
                                                <Trash2 size={10} className="mr-1"/> Borrar
                                            </span>
                                        )}
                                        {!hasWrite && !hasDelete && (
                                            <span className="text-[10px] text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-200">Sólo Lectura</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {(!user.allowedFolders || user.allowedFolders.length === 0) && (
                            <div className="flex items-center text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded border border-orange-100">
                                <AlertCircle size={12} className="mr-1" />
                                <span>Sin carpetas asignadas</span>
                            </div>
                        )}
                    </div>
                </div>
                
                {user.role === 'jefe' && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Usuarios a Cargo:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                             {user.managedUsers && user.managedUsers.length > 0 ? (
                                 user.managedUsers.map(mu => (
                                     <span key={mu} className="bg-gray-100 text-gray-700 text-[10px] px-2 py-1 rounded border border-gray-200 flex items-center">
                                         <Users size={10} className="mr-1 text-gray-400"/> @{mu}
                                     </span>
                                 ))
                             ) : (
                                 <span className="text-[10px] text-gray-400 italic">Nadie asignado</span>
                             )}
                        </div>
                    </div>
                )}
            </div>

            <div className="absolute top-4 right-4 flex space-x-1 opacity-0 group-hover:opacity-100 transition-all">
                <button onClick={() => openEditModal(user)} className="text-gray-400 hover:text-blue-600 p-1.5 rounded-full hover:bg-blue-50"><Edit2 size={16} /></button>
                {user.username !== currentUser.username && (
                    <button onClick={() => handleDeleteUser(user.username)} className="text-gray-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50"><Trash2 size={16} /></button>
                )}
            </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 relative max-h-[90vh] flex flex-col">
            
            {successMsg && (
                <div className="absolute inset-0 z-50 bg-white/90 flex flex-col items-center justify-center animate-in fade-in">
                    <div className="bg-green-100 text-green-700 p-4 rounded-full mb-4"><Check size={32} /></div>
                    <h3 className="text-xl font-bold text-gray-800">{successMsg}</h3>
                </div>
            )}

            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">{editingUser ? 'Editar Usuario' : 'Crear Usuario'}</h3>
              <button onClick={() => setIsModalOpen(false)}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            
            <form onSubmit={handleSaveUser} className="p-6 space-y-4 overflow-y-auto">
              
              <div className="flex justify-center mb-2">
                  <div onClick={() => fileInputRef.current?.click()} className="relative w-20 h-20 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-blue-500 overflow-hidden group">
                      {newAvatar ? <img src={newAvatar} className="w-full h-full object-cover" /> : <Camera size={24} className="text-gray-400" />}
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100"><span className="text-white text-[10px] font-bold">Cambiar</span></div>
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                  </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Nombre</label>
                    <input required className="w-full border border-gray-300 rounded p-2 text-sm" value={newFullName} onChange={e => setNewFullName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Rol</label>
                    {currentUser.role === 'jefe' ? (
                        <div className="w-full border border-gray-200 bg-gray-100 rounded p-2 text-sm text-gray-500 cursor-not-allowed">
                            Usuario (Subordinado)
                        </div>
                    ) : (
                        <select className="w-full border border-gray-300 rounded p-2 text-sm" value={newRole} onChange={(e: any) => setNewRole(e.target.value)}>
                            <option value="user">Usuario</option>
                            <option value="jefe">Jefe / Gestor</option>
                            <option value="admin">Administrador</option>
                        </select>
                    )}
                  </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Usuario</label>
                    <input required disabled={!!editingUser} className={`w-full border border-gray-300 rounded p-2 text-sm ${editingUser ? 'bg-gray-100' : ''}`} value={newUsername} onChange={e => setNewUsername(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Contraseña</label>
                    <input type="password" required={!editingUser} className="w-full border border-gray-300 rounded p-2 text-sm" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••" />
                  </div>
              </div>

              {/* FOLDER PERMISSIONS */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">Acceso a Carpetas {loadingFolders && <span className="text-blue-500 font-normal animate-pulse ml-2">(Cargando...)</span>}</label>
                <p className="text-[10px] text-gray-400 mb-2">
                    {currentUser.role === 'jefe' 
                        ? 'Asigna permisos sobre las carpetas que gestionas.' 
                        : 'Selecciona la carpeta y configura qué puede hacer el usuario en ella.'}
                </p>
                <div className="border border-gray-200 rounded p-2 max-h-60 overflow-y-auto bg-gray-50 space-y-2">
                    {folderOptions.length === 0 && !loadingFolders && (
                        <div className="text-center py-4 text-xs text-gray-400">
                            {token ? 'No hay carpetas disponibles para asignar.' : '⚠️ Conecta Dropbox para asignar carpetas'}
                        </div>
                    )}
                    {folderOptions.map(folder => {
                        const isChecked = !!folderPermissions[folder.path];
                        const perms = folderPermissions[folder.path] || [];
                        const isRoot = folder.path === '/';

                        return (
                            <div key={folder.path} className={`rounded border transition-colors ${isChecked ? 'bg-white border-blue-200 shadow-sm' : 'border-transparent hover:bg-gray-100'}`}>
                                <div className="p-2 flex items-center">
                                    <input 
                                        type="checkbox" 
                                        className="mr-2 h-4 w-4 text-blue-600 rounded"
                                        checked={isChecked} 
                                        onChange={() => togglePath(folder.path)} 
                                        disabled={isRoot && !!folderPermissions['/'] && folder.path !== '/'} // Disable specific check if root is checked? No, keep it flexible
                                    />
                                    <span className="text-xs text-gray-700 break-all flex-1">{folder.label}</span>
                                </div>
                                
                                {isChecked && (
                                    <div className="px-8 pb-2 flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1">
                                        <button 
                                            type="button"
                                            onClick={() => togglePermission(folder.path, 'write')}
                                            className={`flex items-center text-[10px] px-2 py-1 rounded border transition-colors ${perms.includes('write') ? 'bg-blue-100 text-blue-700 border-blue-300 font-bold' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}
                                            title="Permite subir archivos y crear subcarpetas"
                                        >
                                            <UploadCloud size={10} className="mr-1"/> Subir/Crear
                                        </button>

                                        <button 
                                            type="button"
                                            onClick={() => togglePermission(folder.path, 'delete')}
                                            className={`flex items-center text-[10px] px-2 py-1 rounded border transition-colors ${perms.includes('delete') ? 'bg-red-100 text-red-700 border-red-300 font-bold' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}
                                        >
                                            <Trash2 size={10} className="mr-1"/> Eliminar
                                        </button>

                                        <button 
                                            type="button"
                                            onClick={() => togglePermission(folder.path, 'download')}
                                            className={`flex items-center text-[10px] px-2 py-1 rounded border transition-colors ${perms.includes('download') ? 'bg-green-100 text-green-700 border-green-300 font-bold' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}
                                        >
                                            <Download size={10} className="mr-1"/> Descargar
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
              </div>

              {/* MANAGED USERS (Only for Jefe creating nested hierarchy, or Admin creating Jefe) */}
              {(newRole === 'jefe' && currentUser.role === 'admin') && (
                  <div className="animate-in fade-in">
                      <label className="block text-xs font-bold text-blue-600 mb-2 flex items-center"><Users size={12} className="mr-1"/> Usuarios a su cargo (Solo podrá compartir con ellos)</label>
                      <div className="border border-blue-100 rounded p-2 max-h-32 overflow-y-auto bg-blue-50/30 space-y-1">
                          {users.filter(u => u.role === 'user' && u.username !== newUsername).map(u => (
                              <label key={u.id} className="flex items-center space-x-2 cursor-pointer hover:bg-blue-50 p-1 rounded">
                                  <input type="checkbox" checked={managedUsersSelection.includes(u.username)} onChange={() => toggleManagedUser(u.username)} />
                                  <img src={u.avatarUrl} className="w-5 h-5 rounded-full" />
                                  <span className="text-xs text-gray-700">@{u.username}</span>
                              </label>
                          ))}
                          {users.filter(u => u.role === 'user').length === 0 && <p className="text-xs text-gray-400">No hay usuarios disponibles</p>}
                      </div>
                  </div>
              )}

              <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition">
                  {isLoading ? "Guardando..." : "Guardar Usuario"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;