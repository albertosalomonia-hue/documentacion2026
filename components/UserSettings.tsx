import React, { useState, useRef } from 'react';
import { User } from '../types';
import { MockAuthService } from '../services/mockAuth';
import { Camera, Save, Lock, User as UserIcon, CheckCircle, AlertTriangle } from 'lucide-react';

interface UserSettingsProps {
  currentUser: User;
  onUpdateUser: (updatedUser: User) => void;
}

const UserSettings: React.FC<UserSettingsProps> = ({ currentUser, onUpdateUser }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || '');
  
  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            setAvatarUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
        // 1. If changing password, validation is required
        if (newPassword || confirmPassword) {
            if (!currentPassword) {
                throw new Error("Debes ingresar tu contraseña actual para establecer una nueva.");
            }
            if (newPassword !== confirmPassword) {
                throw new Error("Las nuevas contraseñas no coinciden.");
            }
            if (newPassword.length < 3) {
                throw new Error("La nueva contraseña es muy corta.");
            }

            // Verify old password by attempting a "login"
            try {
                await MockAuthService.login(currentUser.username, currentPassword);
            } catch (err) {
                throw new Error("La contraseña actual es incorrecta.");
            }
        }

        // 2. Prepare Updates
        const updates: Partial<User> = {
            fullName,
            avatarUrl
        };

        // 3. Save
        const updatedUser = await MockAuthService.updateUser(
            currentUser.username, 
            updates, 
            newPassword || undefined
        );

        // 4. Update App State
        onUpdateUser(updatedUser);
        
        // 5. Reset sensitive fields
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        
        setSuccessMsg("Perfil actualizado correctamente.");

    } catch (err: any) {
        setErrorMsg(err.message);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in duration-500">
        <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                <UserIcon className="mr-3 text-blue-600" /> Mi Perfil y Configuración
            </h2>
            <p className="text-gray-500 mt-1">Gestiona tu información personal y seguridad de la cuenta.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            
            {/* Messages */}
            {successMsg && (
                <div className="bg-green-50 text-green-700 p-4 flex items-center border-b border-green-100">
                    <CheckCircle size={20} className="mr-2" /> {successMsg}
                </div>
            )}
            {errorMsg && (
                <div className="bg-red-50 text-red-700 p-4 flex items-center border-b border-red-100">
                    <AlertTriangle size={20} className="mr-2" /> {errorMsg}
                </div>
            )}

            <form onSubmit={handleSubmit} className="p-6 md:p-8">
                <div className="flex flex-col md:flex-row gap-8">
                    
                    {/* Left Column: Avatar */}
                    <div className="flex flex-col items-center space-y-4 md:w-1/3">
                        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-100 shadow-lg">
                                <img 
                                    src={avatarUrl || `https://i.pravatar.cc/150?u=${currentUser.username}`} 
                                    alt="Avatar" 
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera className="text-white" size={32} />
                            </div>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*"
                                onChange={handleImageUpload}
                            />
                        </div>
                        <div className="text-center">
                            <h3 className="font-bold text-lg text-gray-800">{currentUser.username}</h3>
                            <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-1 rounded uppercase">
                                {currentUser.role}
                            </span>
                        </div>
                    </div>

                    {/* Right Column: Form Fields */}
                    <div className="flex-1 space-y-6">
                        
                        {/* Personal Info */}
                        <div>
                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 border-b pb-2">Información Básica</h4>
                            <div className="grid gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                                    <input 
                                        type="text" 
                                        value={fullName}
                                        onChange={e => setFullName(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Security */}
                        <div>
                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 border-b pb-2 flex items-center">
                                <Lock size={16} className="mr-2" /> Cambiar Contraseña
                            </h4>
                            
                            <div className="bg-gray-50 p-4 rounded-lg space-y-4 border border-gray-100">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña Actual <span className="text-red-500">*</span></label>
                                    <input 
                                        type="password" 
                                        value={currentPassword}
                                        onChange={e => setCurrentPassword(e.target.value)}
                                        placeholder="Necesaria para guardar cambios"
                                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                    />
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
                                        <input 
                                            type="password" 
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            placeholder="Mínimo 3 caracteres"
                                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Nueva</label>
                                        <input 
                                            type="password" 
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
                                            placeholder="Repite la nueva contraseña"
                                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Submit */}
                        <div className="pt-4 flex justify-end">
                            <button 
                                type="submit" 
                                disabled={isLoading}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-lg hover:shadow-xl transition-all flex items-center disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                                ) : (
                                    <Save size={18} className="mr-2" />
                                )}
                                Guardar Cambios
                            </button>
                        </div>

                    </div>
                </div>
            </form>
        </div>
    </div>
  );
};

export default UserSettings;