import React from 'react';
import { 
  Folder, 
  Users, 
  BarChart2, 
  Settings
} from 'lucide-react';

interface SidebarProps {
    currentView?: string;
    onNavigate?: (view: string) => void;
    userRole?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView = 'plans', onNavigate, userRole }) => {
  const handleNav = (view: string) => {
      if (onNavigate) onNavigate(view);
  };

  return (
    <div className="w-64 bg-sidebar text-gray-300 flex flex-col h-screen text-sm border-r border-gray-800">
      {/* Brand */}
      <div className="h-14 flex items-center px-4 bg-yellow-600 text-white font-bold tracking-wide overflow-hidden whitespace-nowrap cursor-pointer" onClick={() => handleNav('plans')}>
        <span className="mr-2">⚡</span> AYALA DOCS.
        <span className="ml-auto text-xs opacity-75 cursor-pointer">▼</span>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        <div className="px-2 mb-4 space-y-1">
          {/* Main File Browser */}
          <NavItem 
            icon={<Folder size={18} />} 
            label="Archivos" 
            active={currentView === 'plans'} 
            onClick={() => handleNav('plans')}
          />
          
          <NavItem 
            icon={<Users size={18} />} 
            label="Usuarios" 
            active={currentView === 'users'}
            onClick={() => handleNav('users')}
            // Highlight subtly if admin to draw attention
            activeBg={userRole === 'admin' && currentView !== 'users' ? 'hover:bg-purple-900/20 text-purple-200' : undefined}
          />
          
          <NavItem icon={<BarChart2 size={18} />} label="Estadísticas" />
          
          <NavItem 
            icon={<Settings size={18} />} 
            label="Configuración" 
            active={currentView === 'settings'}
            onClick={() => handleNav('settings')}
          />
        </div>
      </nav>
    </div>
  );
};

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  activeBg?: string;
  onClick?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, activeBg, onClick }) => (
  <div 
    onClick={onClick}
    className={`flex items-center px-2 py-2 rounded cursor-pointer transition-colors ${active ? 'bg-blue-600 text-white' : activeBg ? activeBg : 'hover:bg-sidebarHover'}`}
  >
    <span className="mr-3">{icon}</span>
    <span>{label}</span>
  </div>
);

export default Sidebar;