import React, { useEffect, useState } from 'react';
import { Lock, Clock, User, Eye, X, CheckCircle2 } from 'lucide-react';
import { FileLock, FileLockService } from '../services/fileLockService';

interface FileLockModalProps {
    fileName: string;
    filePath: string;
    lock: FileLock;
    onOpenReadOnly: () => void;
    onCancel: () => void;
    onEditAvailable: () => void;
}

function formatElapsed(isoSince: string): string {
    const s = Math.floor((Date.now() - new Date(isoSince).getTime()) / 1000);
    if (s < 60) return `${s} seg`;
    if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} seg`;
    return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

const FileLockModal: React.FC<FileLockModalProps> = ({
    fileName, filePath, lock, onOpenReadOnly, onCancel, onEditAvailable,
}) => {
    const [elapsed, setElapsed] = useState(() => formatElapsed(lock.locked_at));
    const [released, setReleased] = useState(false);

    // Live elapsed counter
    useEffect(() => {
        const id = setInterval(() => setElapsed(formatElapsed(lock.locked_at)), 1000);
        return () => clearInterval(id);
    }, [lock.locked_at]);

    // Poll every 10 s to detect lock release
    useEffect(() => {
        let cancelled = false;
        const check = async () => {
            if (cancelled) return;
            const current = await FileLockService.get(filePath);
            if (!current || current.locked_by !== lock.locked_by) {
                if (!cancelled) {
                    setReleased(true);
                    setTimeout(onEditAvailable, 1800);
                }
            }
        };
        const id = setInterval(check, 10000);
        return () => { cancelled = true; clearInterval(id); };
    }, [filePath, lock.locked_by, onEditAvailable]);

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">

                {released ? (
                    <div className="p-10 text-center">
                        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 size={26} className="text-green-600" />
                        </div>
                        <h3 className="text-base font-bold text-green-800">Archivo disponible</h3>
                        <p className="text-sm text-green-600 mt-1">Abriendo en modo edición…</p>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="bg-amber-50 border-b border-amber-100 px-5 py-4 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                <Lock size={16} className="text-amber-600" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Archivo en uso</p>
                                <p className="text-sm font-semibold text-amber-900 truncate">{fileName}</p>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="px-5 py-4 space-y-4">
                            {/* Who has the lock */}
                            <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <User size={16} className="text-blue-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate">
                                        {lock.locked_by_fullname}
                                    </p>
                                    <p className="text-xs text-gray-400">@{lock.locked_by}</p>
                                </div>
                                <div className="flex items-center gap-1.5 bg-amber-100 text-amber-700 px-2.5 py-1.5 rounded-lg flex-shrink-0">
                                    <Clock size={12} />
                                    <span className="text-xs font-bold tabular-nums whitespace-nowrap">
                                        {elapsed}
                                    </span>
                                </div>
                            </div>

                            <p className="text-sm text-gray-600 leading-relaxed">
                                Este usuario está editando el archivo.
                                Puedes abrirlo en <strong>solo lectura</strong> o esperar a que lo libere.
                            </p>

                            <div className="flex items-center gap-2 text-xs text-gray-400">
                                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block flex-shrink-0" />
                                Verificando disponibilidad cada 10 s…
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex gap-2 px-5 pb-5">
                            <button
                                onClick={onCancel}
                                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                <X size={14} /> Cancelar
                            </button>
                            <button
                                onClick={onOpenReadOnly}
                                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
                            >
                                <Eye size={14} /> Solo Lectura
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default FileLockModal;
