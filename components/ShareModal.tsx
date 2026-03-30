import React, { useState, useEffect } from 'react';
import { User, DropboxFile, PermissionType } from '../types';
import { X, Save, Check, Users, Eye, Edit2, Trash2, Download, AlertCircle } from 'lucide-react';
import { MockAuthService } from '../services/mockAuth';
import { NotificationService } from '../services/notificationService';

interface ShareModalProps {
  file: DropboxFile;
  isOpen: boolean;
  onClose: () => void;
  currentShares: Record<string, PermissionType[]>; 
  onSave: (fileId: string, shareMap: Record<string, PermissionType[]>) => void; // Kept for local UI updates in App if needed, but primary save is DB
  currentUser: User;
}

const ShareModal: React.FC<ShareModalProps> = ({ 
    file, 
    isOpen, 
    onClose, 
    currentUser
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [userPermissions, setUserPermissions] = useState<Record<string, PermissionType[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFolder = file['.tag'] === 'folder';

  useEffect(() => {
    if (isOpen) {
        loadData();
    }
  }, [isOpen, file.id]);

  const loadData = async () => {
      try {
          // 1. Load users available for this user to manage
          const allUsers = await MockAuthService.getUsers();
          let relevantUsers: User[] = [];
          
          if (currentUser.role === 'jefe') {
              // Jefe can only see their managed users
              const managed = currentUser.managedUsers || [];
              relevantUsers = allUsers.filter(u => managed.includes(u.username));
          } else if (currentUser.role === 'admin') {
              // Admin sees everyone except themselves
              relevantUsers = allUsers.filter(u => u.username !== currentUser.username);
          }
          setUsers(relevantUsers);

          // 2. Load existing permissions for this file/folder from those users
          const perms: Record<string, PermissionType[]> = {};
          
          relevantUsers.forEach(u => {
              if (isFolder) {
                  // Check allowedFolders
                  const rule = u.allowedFolders.find(rule => rule.pathPrefix === file.path_lower);
                  if (rule) {
                      perms[u.username] = rule.permissions;
                  }
              } else {
                  // Check sharedFiles
                  const share = u.sharedFiles?.find(s => s.path === file.path_lower);
                  if (share) {
                      perms[u.username] = share.permissions;
                  }
              }
          });
          setUserPermissions(perms);

      } catch (e) {
          console.error(e);
          setError("Error cargando usuarios");
      }
  };

  const toggleUserAccess = (username: string) => {
      setUserPermissions(prev => {
          const newState = { ...prev };
          if (newState[username]) {
              delete newState[username];
          } else {
              // Default to READ only
              newState[username] = ['read'];
          }
          return newState;
      });
  };

  const togglePermission = (username: string, perm: PermissionType) => {
      setUserPermissions(prev => {
          const currentPerms = prev[username] || [];
          let newPerms: PermissionType[];

          if (currentPerms.includes(perm)) {
              newPerms = currentPerms.filter(p => p !== perm);
          } else {
              newPerms = [...currentPerms, perm];
          }

          // Ensure 'read' is always present
          if (!newPerms.includes('read')) newPerms.push('read');

          return {
              ...prev,
              [username]: newPerms
          };
      });
  };

  const handleSave = async () => {
      setIsLoading(true);
      setError(null);
      try {
          // Save changes for each user
          for (const user of users) {
              const username = user.username;
              const newPerms = userPermissions[username] || []; // Empty array means remove access
              
              await MockAuthService.grantAccess(username, {
                  path: file.path_lower,
                  type: isFolder ? 'folder' : 'file',
                  permissions: newPerms
              });
              
              // NOTIFY: Permission change for specific file/folder
              if (newPerms.length > 0) {
                  await NotificationService.create('permission', `Compartió "${file.name}" con @${username} [${newPerms.join(', ')}]`, currentUser.username);
              } else {
                  // If we removed access, we might want to notify too, or just skip
                  // Let's notify revocation
                  // Check if they had access before? Too complex for now, just notify update
                  await NotificationService.create('permission', `Revocó acceso a "${file.name}" para @${username}`, currentUser.username);
              }
          }

          onClose();
      } catch (err: any) {
          setError("Error guardando permisos: " + err.message);
      } finally {
          setIsLoading(false);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center">
              <div className="bg-blue-100 p-2 rounded-lg mr-3 text-blue-600">
                  <Users size={20} />
              </div>
              <div>
                  <h3 className="font-bold text-gray-800 text-sm">Gestionar Acceso {currentUser.role === 'jefe' ? '(Usuarios a Cargo)' : ''}</h3>
                  <p className="text-xs text-gray-500 truncate max-w-[250px]">{file.name}</p>
              </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={20} />
          </button>
        </div>

        {error && (
            <div className="bg-red-50 text-red-600 p-3 text-xs flex items-center">
                <AlertCircle size={14} className="mr-2" /> {error}
            </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {users.length === 0 && (
                <div className="text-center py-8">
                    <p className="text-gray-400 text-sm mb-1">No hay usuarios disponibles.</p>
                    {currentUser.role === 'jefe' && <p className="text-xs text-orange-400">Solo puedes compartir con usuarios asignados a ti por el administrador.</p>}
                </div>
            )}
            
            {users.map(user => {
                const hasAccess = !!userPermissions[user.username];
                const perms = userPermissions[user.username] || [];

                return (
                    <div 
                        key={user.id} 
                        className={`rounded-lg border transition-all ${hasAccess ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                        <div 
                            className="flex items-center p-3 cursor-pointer"
                            onClick={() => toggleUserAccess(user.username)}
                        >
                            <div className={`w-5 h-5 rounded border mr-3 flex items-center justify-center transition-colors ${hasAccess ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                {hasAccess && <Check size={14} className="text-white" />}
                            </div>
                            
                            <img 
                                src={user.avatarUrl || `https://i.pravatar.cc/150?u=${user.username}`} 
                                alt={user.username} 
                                className="w-8 h-8 rounded-full mr-3 object-cover" 
                            />
                            
                            <div className="flex-1">
                                <p className={`text-sm font-medium ${hasAccess ? 'text-blue-900' : 'text-gray-700'}`}>{user.fullName}</p>
                                <p className="text-xs text-gray-500">@{user.username}</p>
                            </div>
                        </div>

                        {hasAccess && (
                            <div className="px-3 pb-3 pt-0 ml-11 flex flex-wrap gap-2">
                                <div className="flex items-center bg-white px-2 py-1 rounded border border-blue-200 shadow-sm opacity-70 cursor-not-allowed" title="Lectura siempre activa">
                                    <Eye size={12} className="mr-1.5 text-blue-600" />
                                    <span className="text-xs text-blue-800 font-medium">Ver</span>
                                </div>

                                {/* DOWNLOAD Permission Toggle */}
                                <div 
                                    onClick={() => togglePermission(user.username, 'download')}
                                    className={`flex items-center px-2 py-1 rounded border shadow-sm cursor-pointer select-none transition-colors ${perms.includes('download') ? 'bg-indigo-100 border-indigo-300' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                                >
                                    <Download size={12} className={`mr-1.5 ${perms.includes('download') ? 'text-indigo-700' : 'text-gray-400'}`} />
                                    <span className={`text-xs font-medium ${perms.includes('download') ? 'text-indigo-800' : 'text-gray-500'}`}>Bajar</span>
                                </div>

                                <div 
                                    onClick={() => togglePermission(user.username, 'write')}
                                    className={`flex items-center px-2 py-1 rounded border shadow-sm cursor-pointer select-none transition-colors ${perms.includes('write') ? 'bg-green-100 border-green-300' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                                >
                                    <Edit2 size={12} className={`mr-1.5 ${perms.includes('write') ? 'text-green-700' : 'text-gray-400'}`} />
                                    <span className={`text-xs font-medium ${perms.includes('write') ? 'text-green-800' : 'text-gray-500'}`}>Editar</span>
                                </div>

                                <div 
                                    onClick={() => togglePermission(user.username, 'delete')}
                                    className={`flex items-center px-2 py-1 rounded border shadow-sm cursor-pointer select-none transition-colors ${perms.includes('delete') ? 'bg-red-100 border-red-300' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                                >
                                    <Trash2 size={12} className={`mr-1.5 ${perms.includes('delete') ? 'text-red-700' : 'text-gray-400'}`} />
                                    <span className={`text-xs font-medium ${perms.includes('delete') ? 'text-red-800' : 'text-gray-500'}`}>Borrar</span>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50">
            <button 
                onClick={handleSave} 
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center disabled:opacity-70"
            >
                {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                    <>
                        <Save size={18} className="mr-2" /> Guardar Permisos
                    </>
                )}
            </button>
        </div>

      </div>
    </div>
  );
};

export default ShareModal;