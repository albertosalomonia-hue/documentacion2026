import React, { useState } from 'react';
import { Lock, User as UserIcon, ArrowRight } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, isLoading, error }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(username, password);
  };

  return (
    <div className="min-h-screen w-full bg-[#f3f4f6] flex items-center justify-center relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-200 rounded-full blur-[100px] opacity-20 animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-yellow-200 rounded-full blur-[100px] opacity-20"></div>

        <div className="bg-white p-10 rounded-2xl shadow-2xl w-full max-w-md z-10 border border-gray-100">
            <div className="flex flex-col items-center mb-8">
                <div className="h-12 w-12 bg-yellow-500 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg mb-4">
                    ⚡
                </div>
                <h1 className="text-2xl font-bold text-gray-800 tracking-tight text-center">AYALA DOCUMENTACION</h1>
                <p className="text-gray-400 text-sm mt-1">Repositorio Seguro de Documentos</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Usuario</label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <UserIcon size={18} className="text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                        <input 
                            type="text" 
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            placeholder="Ingrese su usuario"
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Contraseña</label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock size={18} className="text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                        <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            placeholder="••••••••"
                            required
                        />
                    </div>
                </div>

                {error && (
                    <div className="p-3 bg-red-50 text-red-600 text-xs rounded border border-red-100 flex flex-col gap-2">
                        <div className="flex items-center">
                            <span className="mr-2">●</span> {error}
                        </div>
                        {(error.includes('42P01') || error.includes('42501') || error.includes('Error de conexión al verificar tabla') || error.includes('Error desconocido') || error.includes('RLS')) && (
                            <div className="mt-2 p-2 bg-gray-800 text-gray-200 rounded text-[10px] font-mono overflow-x-auto relative group">
                                <p className="mb-2 text-yellow-400 font-bold">
                                    ⚠️ ATENCIÓN: Se ha cambiado el nombre de la tabla a "accesook".
                                    <br/>
                                    Si la tabla no existe o faltan permisos, ejecuta este script en Supabase:
                                </p>
                                <div className="mb-2">
                                    <a 
                                        href={`https://supabase.com/dashboard/project/${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('.')[0]?.split('//')[1] || '_'}/sql/new`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 underline flex items-center"
                                    >
                                        Abrir Editor SQL de Supabase <ArrowRight size={12} className="ml-1"/>
                                    </a>
                                </div>
                                <button 
                                    onClick={() => {
                                        const code = `-- COPIA Y PEGA TODO ESTE BLOQUE EN EL EDITOR SQL DE SUPABASE:

-- 1. Crear tabla
CREATE TABLE IF NOT EXISTS accesook (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    username text NOT NULL UNIQUE,
    password text NOT NULL,
    user_metadata jsonb DEFAULT '{}'::jsonb
);

-- 2. Habilitar RLS
ALTER TABLE accesook ENABLE ROW LEVEL SECURITY;

-- 3. Crear política de acceso público
DROP POLICY IF EXISTS "Allow public access to accesook" ON accesook;

CREATE POLICY "Allow public access to accesook"
ON accesook
FOR ALL
USING (true)
WITH CHECK (true);

-- 4. Otorgar permisos
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 5. Insertar admin por defecto
INSERT INTO accesook (username, password, user_metadata)
VALUES (
    'admin',
    '123',
    '{
        "id": "u1",
        "role": "admin",
        "fullName": "Super Admin",
        "avatarUrl": "https://i.pravatar.cc/150?u=admin",
        "allowedFolders": [{"pathPrefix": "/", "permissions": ["read", "write", "delete", "download"]}],
        "sharedFiles": []
    }'::jsonb
) ON CONFLICT (username) DO NOTHING;`;
                                        navigator.clipboard.writeText(code);
                                        alert("Código SQL copiado al portapapeles");
                                    }}
                                    className="absolute top-2 right-2 bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Copiar SQL"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                </button>
                                <pre className="whitespace-pre-wrap select-all">
{`-- COPIA Y PEGA TODO ESTE BLOQUE EN EL EDITOR SQL DE SUPABASE:

-- 1. Crear tabla
CREATE TABLE IF NOT EXISTS accesook (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    username text NOT NULL UNIQUE,
    password text NOT NULL,
    user_metadata jsonb DEFAULT '{}'::jsonb
);

-- 2. Habilitar RLS
ALTER TABLE accesook ENABLE ROW LEVEL SECURITY;

-- 3. Crear política de acceso público
DROP POLICY IF EXISTS "Allow public access to accesook" ON accesook;

CREATE POLICY "Allow public access to accesook"
ON accesook
FOR ALL
USING (true)
WITH CHECK (true);

-- 4. Otorgar permisos
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 5. Insertar admin por defecto
INSERT INTO accesook (username, password, user_metadata)
VALUES (
    'admin',
    '123',
    '{
        "id": "u1",
        "role": "admin",
        "fullName": "Super Admin",
        "avatarUrl": "https://i.pravatar.cc/150?u=admin",
        "allowedFolders": [{"pathPrefix": "/", "permissions": ["read", "write", "delete", "download"]}],
        "sharedFiles": []
    }'::jsonb
) ON CONFLICT (username) DO NOTHING;`}
                                </pre>
                            </div>
                        )}

                    </div>
                )}
                
                <button 
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-[#1a1a1a] hover:bg-black text-white py-3 rounded-lg font-medium transition-all transform active:scale-[0.98] flex items-center justify-center shadow-lg hover:shadow-xl disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                        <>
                            Ingresar <ArrowRight size={16} className="ml-2" />
                        </>
                    )}
                </button>
            </form>
        </div>
    </div>
  );
};

export default LoginScreen;