import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    Activity, Users, FolderOpen, Upload, LogIn, Clock,
    RefreshCw, Loader2, TrendingUp, LogOut, Trash2, Edit3, Download,
} from 'lucide-react';
import { NotificationService } from '../services/notificationService';
import { Notification } from '../types';

// Extracts the folder path embedded at the end of notification messages: " en /some/path"
function extractPath(msg: string): string | null {
    const m = msg.match(/ en (\/[^\s]*)$/);
    return m ? m[1] : null;
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

type FilterKey = 'all' | 'login' | 'upload' | 'sync' | 'delete';

const FILTER_LABELS: Record<FilterKey, string> = {
    all: 'Todo',
    login: 'Accesos',
    upload: 'Subidas',
    sync: 'Sincronizados',
    delete: 'Eliminados',
};

function typeBadge(type: string, msg: string): { label: string; cls: string } {
    if (type === 'system' && msg.includes('inició sesión'))  return { label: 'Acceso',      cls: 'bg-blue-100 text-blue-700' };
    if (type === 'system' && msg.includes('cerró sesión'))   return { label: 'Salida',      cls: 'bg-slate-100 text-slate-600' };
    if (type === 'system' && msg.includes('Descargó'))       return { label: 'Descarga',    cls: 'bg-cyan-100 text-cyan-700' };
    if (type === 'system' && msg.includes('Abrió'))          return { label: 'Apertura',    cls: 'bg-teal-100 text-teal-700' };
    if (type === 'system')                                   return { label: 'Sistema',     cls: 'bg-gray-100 text-gray-600' };
    if (type === 'upload' && msg.includes('Sincronizó'))     return { label: 'Sync',        cls: 'bg-green-100 text-green-700' };
    if (type === 'upload' && msg.includes('Editó'))          return { label: 'Edición',     cls: 'bg-emerald-100 text-emerald-700' };
    if (type === 'upload' && msg.includes('Subió'))          return { label: 'Subida',      cls: 'bg-indigo-100 text-indigo-700' };
    if (type === 'upload' && msg.includes('carpeta'))        return { label: 'Carpeta',     cls: 'bg-yellow-100 text-yellow-700' };
    if (type === 'upload' && msg.includes('Movió'))          return { label: 'Movido',      cls: 'bg-orange-100 text-orange-700' };
    if (type === 'upload')                                   return { label: 'Subida',      cls: 'bg-indigo-100 text-indigo-700' };
    if (type === 'delete')                                   return { label: 'Eliminado',   cls: 'bg-red-100 text-red-700' };
    if (type === 'permission')                               return { label: 'Permiso',     cls: 'bg-purple-100 text-purple-700' };
    return { label: type, cls: 'bg-gray-100 text-gray-600' };
}

const StatCard: React.FC<{ label: string; value: number | string; icon: React.ReactNode; colorCls: string; loading: boolean }> = ({ label, value, icon, colorCls, loading }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className={`w-9 h-9 rounded-lg ${colorCls} flex items-center justify-center mb-3`}>{icon}</div>
        <div className="text-2xl font-bold text-gray-900">{loading ? <span className="text-gray-300">—</span> : value}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
);

const ActivityDashboard: React.FC = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterKey>('all');

    const load = useCallback(async () => {
        setLoading(true);
        const data = await NotificationService.getAll();
        setNotifications(data);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const todayStr = new Date().toDateString();

    const todayAll   = useMemo(() => notifications.filter(n => new Date(n.created_at).toDateString() === todayStr), [notifications, todayStr]);
    const allLogins  = useMemo(() => notifications.filter(n => n.type === 'system' && n.message.includes('inició sesión')), [notifications]);
    const todayLogin = useMemo(() => allLogins.filter(n => new Date(n.created_at).toDateString() === todayStr), [allLogins, todayStr]);
    const allSyncs   = useMemo(() => notifications.filter(n => n.type === 'upload' && (n.message.includes('Editó') || n.message.includes('Sincronizó'))), [notifications]);
    const todaySyncs = useMemo(() => allSyncs.filter(n => new Date(n.created_at).toDateString() === todayStr), [allSyncs, todayStr]);

    // Top users by total action count
    const userActivity = useMemo(() => {
        const map: Record<string, { count: number; lastSeen: string; loginCount: number; syncCount: number }> = {};
        for (const n of notifications) {
            const u = n.actor_username;
            if (!u) continue;
            if (!map[u]) map[u] = { count: 0, lastSeen: n.created_at, loginCount: 0, syncCount: 0 };
            map[u].count++;
            if (new Date(n.created_at) > new Date(map[u].lastSeen)) map[u].lastSeen = n.created_at;
            if (n.type === 'system' && n.message.includes('inició sesión')) map[u].loginCount++;
            if (n.type === 'upload' && (n.message.includes('Editó') || n.message.includes('Sincronizó'))) map[u].syncCount++;
        }
        return Object.entries(map)
            .map(([user, d]) => ({ user, ...d }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
    }, [notifications]);

    const maxCount = userActivity[0]?.count || 1;

    // Top directories extracted from " en /path" suffix in messages
    const dirActivity = useMemo(() => {
        const map: Record<string, number> = {};
        for (const n of notifications) {
            const p = extractPath(n.message);
            if (!p) continue;
            map[p] = (map[p] || 0) + 1;
        }
        return Object.entries(map)
            .map(([path, count]) => ({ path, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 7);
    }, [notifications]);

    const maxDir = dirActivity[0]?.count || 1;

    // Login history (last 50)
    const loginHistory = useMemo(() =>
        allLogins.slice(0, 50),
    [allLogins]);

    // Filtered activity log
    const filteredLog = useMemo(() => {
        let base = notifications;
        if (filter === 'login')  base = base.filter(n => n.type === 'system' && n.message.includes('sesión'));
        if (filter === 'upload') base = base.filter(n => n.type === 'upload' && !n.message.includes('Editó') && !n.message.includes('Sincronizó'));
        if (filter === 'sync')   base = base.filter(n => n.type === 'upload' && (n.message.includes('Editó') || n.message.includes('Sincronizó')));
        if (filter === 'delete') base = base.filter(n => n.type === 'delete');
        return base.slice(0, 150);
    }, [notifications, filter]);

    const activeUsers = useMemo(() => {
        const users = new Set(notifications.map(n => n.actor_username).filter(Boolean));
        return users.size;
    }, [notifications]);

    return (
        <div className="max-w-6xl mx-auto py-6 px-4">

            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                        <Activity className="text-violet-600" size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Actividad del Sistema</h2>
                        <p className="text-xs text-gray-500">Accesos, archivos sincronizados y directorios más usados</p>
                    </div>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Actualizar
                </button>
            </div>

            {/* ── Summary cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard label="Accesos hoy"        value={todayLogin.length}  icon={<LogIn size={18} />}     colorCls="bg-blue-100 text-blue-600"   loading={loading} />
                <StatCard label="Eventos hoy"        value={todayAll.length}    icon={<Activity size={18} />}  colorCls="bg-violet-100 text-violet-600" loading={loading} />
                <StatCard label="Sincronizados hoy"  value={todaySyncs.length}  icon={<Upload size={18} />}    colorCls="bg-green-100 text-green-600"  loading={loading} />
                <StatCard label="Usuarios con acción" value={activeUsers}        icon={<Users size={18} />}     colorCls="bg-orange-100 text-orange-600" loading={loading} />
            </div>

            {/* ── Top users + Top directories ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

                {/* Top users */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp size={16} className="text-violet-500" />
                        <h3 className="text-sm font-bold text-gray-800">Usuarios más activos</h3>
                    </div>
                    {loading ? (
                        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" />)}</div>
                    ) : userActivity.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">Sin datos de actividad</p>
                    ) : (
                        <div className="space-y-3">
                            {userActivity.map((u, i) => (
                                <div key={u.user}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="flex items-center gap-1.5 font-semibold text-gray-800">
                                            <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-700 text-[9px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                            {u.user}
                                        </span>
                                        <span className="text-gray-400 ml-2 whitespace-nowrap">
                                            {u.loginCount > 0 && <span className="mr-2 text-blue-500">{u.loginCount} accesos</span>}
                                            {u.syncCount > 0  && <span className="mr-2 text-green-500">{u.syncCount} syncs</span>}
                                            <span className="text-gray-500">{u.count} total</span>
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-violet-400 rounded-full transition-all" style={{ width: `${(u.count / maxCount) * 100}%` }} />
                                    </div>
                                    <div className="text-[10px] text-gray-400 mt-0.5">
                                        Última actividad: {fmtDate(u.lastSeen)} {fmtTime(u.lastSeen)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Top directories */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <FolderOpen size={16} className="text-yellow-500" />
                        <h3 className="text-sm font-bold text-gray-800">Directorios más usados</h3>
                    </div>
                    {loading ? (
                        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" />)}</div>
                    ) : dirActivity.length === 0 ? (
                        <div className="text-center py-8">
                            <FolderOpen size={32} className="mx-auto mb-2 text-gray-200" />
                            <p className="text-sm text-gray-400">Sin datos de directorio aún</p>
                            <p className="text-xs text-gray-300 mt-1">Se registran al subir, editar o sincronizar archivos</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {dirActivity.map((d, i) => (
                                <div key={d.path}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="font-mono text-gray-700 truncate max-w-[200px]" title={d.path}>
                                            <span className="text-gray-400 mr-1">{i + 1}.</span>{d.path}
                                        </span>
                                        <span className="text-gray-500 flex-shrink-0 ml-2">{d.count} eventos</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${(d.count / maxDir) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Login history ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-4">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                    <LogIn size={15} className="text-blue-500" />
                    <h3 className="text-sm font-bold text-gray-800">Historial de accesos</h3>
                    <span className="text-xs text-gray-400">({loginHistory.length})</span>
                </div>
                {loading ? (
                    <div className="p-6 text-center text-gray-300"><Loader2 className="animate-spin mx-auto" size={22} /></div>
                ) : loginHistory.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-400">Sin registros de acceso</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-50">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hora</th>
                                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loginHistory.slice(0, 20).map(n => (
                                    <tr key={n.id} className="hover:bg-blue-50/40 transition-colors">
                                        <td className="px-4 py-2 text-sm font-semibold text-gray-800">{n.actor_username}</td>
                                        <td className="px-4 py-2 text-xs text-gray-500">{fmtDate(n.created_at)}</td>
                                        <td className="px-4 py-2 text-xs font-mono text-blue-600">{fmtTime(n.created_at)}</td>
                                        <td className="px-4 py-2">
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                                {n.message.includes('inició') ? 'Entró' : 'Salió'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Full activity log ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Clock size={15} className="text-gray-400" />
                        <h3 className="text-sm font-bold text-gray-800">Registro de actividad</h3>
                        <span className="text-xs text-gray-400">({filteredLog.length})</span>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                        {(Object.keys(FILTER_LABELS) as FilterKey[]).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${filter === f ? 'bg-violet-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                            >
                                {FILTER_LABELS[f]}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-gray-300"><Loader2 className="animate-spin mx-auto mb-2" size={24} /></div>
                ) : filteredLog.length === 0 ? (
                    <div className="p-8 text-center text-sm text-gray-400">Sin eventos en esta categoría</div>
                ) : (
                    <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
                        {filteredLog.map(n => {
                            const badge = typeBadge(n.type, n.message);
                            return (
                                <div key={n.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${badge.cls}`}>
                                        {badge.label}
                                    </span>
                                    <span className="text-xs font-semibold text-gray-700 flex-shrink-0 w-24 truncate">{n.actor_username}</span>
                                    <span className="text-xs text-gray-500 flex-1 min-w-0 truncate" title={n.message}>{n.message}</span>
                                    <div className="text-right flex-shrink-0">
                                        <div className="text-[11px] font-semibold text-gray-600">{fmtTime(n.created_at)}</div>
                                        <div className="text-[10px] text-gray-400">{fmtDate(n.created_at)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActivityDashboard;
