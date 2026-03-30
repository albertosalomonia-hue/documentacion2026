import React, { useState, useEffect } from 'react';
import { ChevronDown, RotateCcw, FolderPlus, LogOut, LayoutGrid, List, UploadCloud, Bell, Check, Trash2 } from 'lucide-react';
import { User, Notification } from '../types';
import { NotificationService } from '../services/notificationService';

interface TopBarProps {
  onSearch: (term: string) => void;
  onUpload: () => void;
  onFolderUpload: () => void;
  dropboxConnected: boolean;
  onConnectDropbox: () => void;
  currentUser: User;
  onLogout: () => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onRefresh?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ 
    onSearch, 
    onUpload,
    onFolderUpload,
    dropboxConnected, 
    onConnectDropbox, 
    currentUser,
    onLogout,
    viewMode,
    onViewModeChange,
    onRefresh
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (currentUser.role === 'admin') {
      loadNotifications();
      const interval = setInterval(loadNotifications, 30000); // Poll every 30s
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  const loadNotifications = async () => {
    const data = await NotificationService.getAll();
    setNotifications(data);
    setUnreadCount(data.filter(n => !n.is_read).length);
  };

  const handleMarkAsRead = async (id: number) => {
    await NotificationService.markAsRead(id);
    loadNotifications();
  };

  const handleMarkAllRead = async () => {
    await NotificationService.markAllAsRead();
    loadNotifications();
  };

  const handleClearAll = async () => {
    await NotificationService.clearAll();
    loadNotifications();
  };

  return (
    <div className="flex flex-col bg-white border-b border-gray-200">
      {/* Header Level 1 */}
      <div className="h-14 border-b border-gray-200 flex items-center justify-end px-4">
        
        {/* Right Actions */}
        <div className="flex items-center space-x-4 text-gray-600 text-sm">
            
            {/* NOTIFICATIONS (ADMIN ONLY) */}
            {currentUser.role === 'admin' && (
                <div className="relative">
                    <button 
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="p-2 rounded-full hover:bg-gray-100 relative text-gray-500 hover:text-blue-600 transition-colors"
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && (
                            <span className="absolute top-0 right-0 h-4 w-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
                                {unreadCount}
                            </span>
                        )}
                    </button>

                    {showNotifications && (
                        <div className="absolute top-full right-0 mt-2 w-80 bg-white shadow-2xl rounded-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                <h3 className="font-bold text-gray-700 text-xs uppercase tracking-wider">Notificaciones</h3>
                                <div className="flex space-x-1">
                                    <button onClick={handleMarkAllRead} className="p-1 hover:bg-gray-200 rounded text-gray-500" title="Marcar todo como leído">
                                        <Check size={14} />
                                    </button>
                                    <button onClick={handleClearAll} className="p-1 hover:bg-red-100 rounded text-red-500" title="Borrar todo">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400 text-sm">
                                        No hay notificaciones recientes
                                    </div>
                                ) : (
                                    notifications.map(n => (
                                        <div key={n.id} className={`p-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-blue-50/50' : ''}`}>
                                            <div className="flex justify-between items-start mb-1">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                                    n.type === 'upload' ? 'bg-green-100 text-green-700' :
                                                    n.type === 'delete' ? 'bg-red-100 text-red-700' :
                                                    n.type === 'permission' ? 'bg-purple-100 text-purple-700' :
                                                    'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {n.type === 'upload' ? 'Subida' : 
                                                     n.type === 'delete' ? 'Eliminación' : 
                                                     n.type === 'permission' ? 'Permisos' : 'Sistema'}
                                                </span>
                                                <span className="text-[10px] text-gray-400">
                                                    {new Date(n.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-800 mb-1">{n.message}</p>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] text-gray-500 font-medium">Por: @{n.actor_username}</span>
                                                {!n.is_read && (
                                                    <button onClick={() => handleMarkAsRead(n.id)} className="text-[10px] text-blue-600 hover:underline">
                                                        Marcar leído
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center space-x-1 cursor-pointer hover:text-gray-900">
                <span className="font-semibold text-xs bg-gray-100 px-2 py-1 rounded uppercase tracking-wide">{currentUser.role}</span>
            </div>
            
            {/* User Profile Dropdown */}
            <div className="flex items-center cursor-pointer hover:text-gray-900 relative group">
                <span className="mr-2 font-medium text-right leading-tight">
                    <div className="text-sm">{currentUser.fullName}</div>
                    <div className="text-[10px] text-gray-400 font-normal">@{currentUser.username}</div>
                </span>
                <ChevronDown size={14} />
                
                {/* Dropdown Menu */}
                <div className="absolute top-full right-0 mt-2 w-56 bg-white shadow-xl rounded-lg border border-gray-100 hidden group-hover:block z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-3 border-b border-gray-100 bg-gray-50">
                        <div className="text-xs font-semibold text-gray-500">Permisos del Sistema</div>
                        <div className="text-xs text-gray-400 mt-1">
                            {currentUser.allowedFolders?.map(f => (
                                <div key={f.pathPrefix} className="truncate">
                                    {f.pathPrefix === '/' ? 'Todos' : f.pathPrefix}: [{f.permissions.join(', ')}]
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Dropbox Connection (Admin only) */}
                    <div className="p-2 border-b border-gray-100">
                        {currentUser.role === 'admin' ? (
                            !dropboxConnected ? (
                                 <button onClick={onConnectDropbox} className="w-full text-left px-3 py-2 text-blue-600 hover:bg-blue-50 text-sm rounded transition-colors font-medium">
                                    ⚡ Conectar Storage
                                 </button>
                            ) : (
                                <div className="px-3 py-2 text-green-600 text-xs flex items-center">
                                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span> Storage Conectado
                                </div>
                            )
                        ) : (
                            <div className="px-3 py-2 text-gray-400 text-xs flex items-center">
                                <span className={`w-2 h-2 rounded-full mr-2 ${dropboxConnected ? 'bg-green-500' : 'bg-red-500'}`}></span> 
                                {dropboxConnected ? 'Conexión Global OK' : 'Sin Conexión'}
                            </div>
                        )}
                    </div>
                    
                    <button onClick={onLogout} className="w-full text-left px-4 py-3 text-red-600 hover:bg-red-50 text-sm flex items-center transition-colors">
                        <LogOut size={16} className="mr-2" /> Cerrar Sesión
                    </button>
                </div>
            </div>
             <img 
                src={currentUser.avatarUrl || "https://picsum.photos/32/32"} 
                alt="User" 
                className="w-9 h-9 rounded-full border border-gray-200 object-cover" 
            />
        </div>
      </div>

      {/* Toolbar Level 2 */}
      <div className="h-12 flex items-center justify-between px-4 bg-gray-50/50">
        <div className="flex items-center space-x-2">
            <button 
                onClick={onUpload}
                disabled={!dropboxConnected}
                className={`border border-gray-300 px-3 py-1.5 rounded text-sm font-medium flex items-center shadow-sm transition-colors ${!dropboxConnected ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white hover:bg-gray-50 text-gray-700'}`}
            >
                <FolderPlus size={16} className="mr-1" /> Subir Archivos
            </button>
            
            <button 
                onClick={onFolderUpload}
                disabled={!dropboxConnected}
                className={`border border-gray-300 px-3 py-1.5 rounded text-sm font-medium flex items-center shadow-sm transition-colors ${!dropboxConnected ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white hover:bg-gray-50 text-gray-700'}`}
                title="Subir carpeta completa"
            >
                <UploadCloud size={16} className="mr-1" /> Subir Carpeta
            </button>

            <div className="h-4 w-px bg-gray-300 mx-2"></div>
            <button 
                onClick={onRefresh}
                className="p-1.5 text-gray-500 hover:text-gray-700 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 active:scale-95 transition-all"
                title="Actualizar lista"
            >
                <RotateCcw size={16} />
            </button>
        </div>

        <div className="flex items-center space-x-1 bg-gray-200 p-1 rounded-lg">
            <button 
                onClick={() => onViewModeChange('grid')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="Vista de Cuadrícula"
            >
                <LayoutGrid size={16} />
            </button>
            <button 
                onClick={() => onViewModeChange('list')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="Vista de Lista"
            >
                <List size={16} />
            </button>
        </div>
      </div>
    </div>
  );
};

export default TopBar;