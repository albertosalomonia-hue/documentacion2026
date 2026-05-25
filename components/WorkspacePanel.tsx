import React, { useRef } from 'react';
import { Briefcase, FolderOpen, RefreshCw, X, CheckCircle, Loader2, AlertCircle, Upload } from 'lucide-react';

export interface WorkspaceItem {
    name: string;
    dropboxPath: string;
    downloadedAt: string;
    size: number;
}

interface WorkspacePanelProps {
    items: WorkspaceItem[];
    dirHandle: any | null;
    dirName: string | null;
    onConfigureDir: () => void;
    onSyncAll: () => void;
    onRemove: (dropboxPath: string) => void;
    onFileSelected: (item: WorkspaceItem, file: File) => void;
    isSyncing: boolean;
    syncStatuses: Record<string, 'idle' | 'syncing' | 'done' | 'error' | 'missing'>;
}

const fmtSize = (b: number) =>
    b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : (b / 1024).toFixed(1) + ' KB';

const fsApiSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

const WorkspacePanel: React.FC<WorkspacePanelProps> = ({
    items, dirHandle, dirName, onConfigureDir, onSyncAll, onRemove,
    onFileSelected, isSyncing, syncStatuses,
}) => {
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const syncStatusIcon = (status: string) => {
        if (status === 'syncing') return <Loader2 size={14} className="animate-spin text-blue-500 flex-shrink-0" />;
        if (status === 'done')    return <CheckCircle size={14} className="text-green-500 flex-shrink-0" />;
        if (status === 'error')   return <AlertCircle size={14} className="text-red-500 flex-shrink-0" />;
        if (status === 'missing') return <AlertCircle size={14} className="text-amber-400 flex-shrink-0" />;
        return <div className="w-3.5 h-3.5 flex-shrink-0" />;
    };

    const rowBg = (status: string) => {
        if (status === 'done')    return 'bg-green-50';
        if (status === 'error')   return 'bg-red-50';
        if (status === 'missing') return 'bg-amber-50';
        return '';
    };

    return (
        <div className="max-w-4xl mx-auto py-6 px-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                        <Briefcase className="text-blue-600" size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Directorio Trabajos</h2>
                        <p className="text-xs text-gray-500">Archivos descargados para editar y sincronizar con Dropbox</p>
                    </div>
                </div>
                {items.length > 0 && (
                    <button
                        onClick={onSyncAll}
                        disabled={isSyncing}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors shadow-sm"
                    >
                        {isSyncing
                            ? <Loader2 size={16} className="animate-spin" />
                            : <RefreshCw size={16} />
                        }
                        Sincronizar
                    </button>
                )}
            </div>

            {/* Directory status card */}
            <div className={`rounded-xl border p-4 mb-6 flex items-center gap-3 ${dirHandle ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <FolderOpen size={20} className={dirHandle ? 'text-green-600' : 'text-amber-500'} />
                <div className="flex-1 min-w-0">
                    {dirHandle ? (
                        <>
                            <p className="text-sm font-medium text-green-800">Directorio configurado</p>
                            <p className="text-xs text-green-700 font-mono truncate">{dirName || 'trabajos'}</p>
                        </>
                    ) : (
                        <>
                            <p className="text-sm font-medium text-amber-800">Sin directorio local configurado</p>
                            <p className="text-xs text-amber-600">
                                {fsApiSupported
                                    ? 'Selecciona o crea la carpeta "trabajos" en tu equipo para guardar y editar archivos.'
                                    : 'Tu navegador no soporta acceso a directorios. Los archivos se descargarán y podrás subirlos manualmente.'}
                            </p>
                        </>
                    )}
                </div>
                {fsApiSupported && (
                    <button
                        onClick={onConfigureDir}
                        className={`flex-shrink-0 text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                            dirHandle
                                ? 'border-green-300 bg-white hover:bg-green-50 text-green-700'
                                : 'border-amber-300 bg-white hover:bg-amber-50 text-amber-700'
                        }`}
                    >
                        {dirHandle ? 'Cambiar' : 'Configurar directorio'}
                    </button>
                )}
            </div>

            {/* File list */}
            {items.length === 0 ? (
                <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                    <Briefcase size={44} className="mx-auto mb-3 opacity-25" />
                    <p className="text-sm font-medium text-gray-500">El espacio de trabajo está vacío</p>
                    <p className="text-xs mt-1 text-gray-400">
                        Haz clic derecho en cualquier archivo → <strong>Guardar en Trabajos</strong>
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            {items.length} archivo{items.length !== 1 ? 's' : ''} en el espacio de trabajo
                        </span>
                        {!dirHandle && (
                            <span className="text-xs text-amber-600 italic">
                                Usa "Subir editado" por archivo para sincronizar sin directorio configurado
                            </span>
                        )}
                    </div>
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Archivo</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ruta en Dropbox</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Descargado</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map(item => {
                                const status = syncStatuses[item.dropboxPath] || 'idle';
                                return (
                                    <tr key={item.dropboxPath} className={`transition-colors ${rowBg(status)}`}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {syncStatusIcon(status)}
                                                <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]" title={item.name}>
                                                    {item.name}
                                                </span>
                                                <span className="text-xs text-gray-400 whitespace-nowrap">{fmtSize(item.size)}</span>
                                            </div>
                                            {status === 'missing' && (
                                                <p className="text-xs text-amber-600 mt-0.5 ml-6">No encontrado en el directorio local</p>
                                            )}
                                            {status === 'error' && (
                                                <p className="text-xs text-red-500 mt-0.5 ml-6">Error al sincronizar</p>
                                            )}
                                            {status === 'done' && (
                                                <p className="text-xs text-green-600 mt-0.5 ml-6">Sincronizado con Dropbox</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className="text-xs text-gray-500 font-mono truncate max-w-[200px] block"
                                                title={item.dropboxPath}
                                            >
                                                {item.dropboxPath}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                            {new Date(item.downloadedAt).toLocaleDateString('es', {
                                                day: '2-digit', month: '2-digit', year: 'numeric'
                                            })}
                                            <br />
                                            <span className="text-blue-400">
                                                {new Date(item.downloadedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {/* Manual upload — always shown, essential when no FS API */}
                                                <input
                                                    type="file"
                                                    ref={el => { fileInputRefs.current[item.dropboxPath] = el; }}
                                                    className="hidden"
                                                    onChange={e => {
                                                        const f = e.target.files?.[0];
                                                        if (f) onFileSelected(item, f);
                                                        e.target.value = '';
                                                    }}
                                                />
                                                <button
                                                    onClick={() => fileInputRefs.current[item.dropboxPath]?.click()}
                                                    disabled={status === 'syncing'}
                                                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-40 transition-colors"
                                                    title="Seleccionar archivo editado y subir a Dropbox"
                                                >
                                                    <Upload size={12} />
                                                    Subir editado
                                                </button>
                                                <button
                                                    onClick={() => onRemove(item.dropboxPath)}
                                                    disabled={status === 'syncing'}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40 transition-colors"
                                                    title="Quitar del espacio de trabajo"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default WorkspacePanel;
