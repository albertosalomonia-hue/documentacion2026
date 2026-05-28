import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    Activity, Users, FolderOpen, Upload, LogIn,
    Clock, RefreshCw, Loader2, TrendingUp, LayoutDashboard,
} from 'lucide-react';
import { NotificationService } from '../services/notificationService';
import { Notification } from '../types';

// ─── helpers ────────────────────────────────────────────────────────────────

function extractPath(msg: string): string | null {
    const m = msg.match(/ en (\/[^\s]*)$/);
    return m ? m[1] : null;
}
const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

function typeBadge(type: string, msg: string): { label: string; cls: string } {
    if (type === 'system' && msg.includes('inició sesión'))  return { label: 'Acceso',    cls: 'bg-blue-100 text-blue-700' };
    if (type === 'system' && msg.includes('cerró sesión'))   return { label: 'Salida',    cls: 'bg-slate-100 text-slate-600' };
    if (type === 'system' && msg.includes('Descargó'))       return { label: 'Descarga',  cls: 'bg-cyan-100 text-cyan-700' };
    if (type === 'system' && msg.includes('Abrió'))          return { label: 'Apertura',  cls: 'bg-teal-100 text-teal-700' };
    if (type === 'system')                                   return { label: 'Sistema',   cls: 'bg-gray-100 text-gray-600' };
    if (type === 'upload' && msg.includes('Sincronizó'))     return { label: 'Sync',      cls: 'bg-green-100 text-green-700' };
    if (type === 'upload' && msg.includes('Editó'))          return { label: 'Edición',   cls: 'bg-emerald-100 text-emerald-700' };
    if (type === 'upload' && msg.includes('Movió'))          return { label: 'Movido',    cls: 'bg-orange-100 text-orange-700' };
    if (type === 'upload' && msg.includes('carpeta'))        return { label: 'Carpeta',   cls: 'bg-yellow-100 text-yellow-700' };
    if (type === 'upload')                                   return { label: 'Subida',    cls: 'bg-indigo-100 text-indigo-700' };
    if (type === 'delete')                                   return { label: 'Eliminado', cls: 'bg-red-100 text-red-700' };
    if (type === 'permission')                               return { label: 'Permiso',   cls: 'bg-purple-100 text-purple-700' };
    return { label: type, cls: 'bg-gray-100 text-gray-600' };
}

// ─── sub-components ──────────────────────────────────────────────────────────

const Skeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
    <div className="space-y-3 p-4">
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />
        ))}
    </div>
);

const StatCard: React.FC<{
    label: string; value: number | string; icon: React.ReactNode; colorCls: string; loading: boolean;
}> = ({ label, value, icon, colorCls, loading }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className={`w-9 h-9 rounded-lg ${colorCls} flex items-center justify-center mb-3`}>{icon}</div>
        <div className="text-2xl font-bold text-gray-900">{loading ? <span className="text-gray-300">—</span> : value}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
);

const EmptyState: React.FC<{ msg: string; sub?: string }> = ({ msg, sub }) => (
    <div className="py-14 text-center">
        <p className="text-sm text-gray-400">{msg}</p>
        {sub && <p className="text-xs text-gray-300 mt-1">{sub}</p>}
    </div>
);

// ─── TAB DEFINITIONS ─────────────────────────────────────────────────────────

type TabKey = 'resumen' | 'usuarios' | 'directorios' | 'accesos' | 'actividad';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'resumen',     label: 'Resumen',      icon: <LayoutDashboard size={14} /> },
    { key: 'usuarios',    label: 'Usuarios',     icon: <Users size={14} /> },
    { key: 'directorios', label: 'Directorios',  icon: <FolderOpen size={14} /> },
    { key: 'accesos',     label: 'Accesos',      icon: <LogIn size={14} /> },
    { key: 'actividad',   label: 'Actividad',    icon: <Clock size={14} /> },
];

type LogFilter = 'all' | 'upload' | 'sync' | 'delete' | 'system';
const LOG_FILTERS: { key: LogFilter; label: string }[] = [
    { key: 'all',    label: 'Todo' },
    { key: 'upload', label: 'Subidas' },
    { key: 'sync',   label: 'Syncs' },
    { key: 'delete', label: 'Eliminados' },
    { key: 'system', label: 'Sistema' },
];

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

const ActivityDashboard: React.FC = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<TabKey>('resumen');
    const [logFilter, setLogFilter] = useState<LogFilter>('all');

    const load = useCallback(async () => {
        setLoading(true);
        setNotifications(await NotificationService.getAll());
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const todayStr = new Date().toDateString();

    // ── derived data ──────────────────────────────────────────────────────────
    const todayAll   = useMemo(() => notifications.filter(n => new Date(n.created_at).toDateString() === todayStr), [notifications, todayStr]);
    const allLogins  = useMemo(() => notifications.filter(n => n.type === 'system' && n.message.includes('inició sesión')), [notifications]);
    const todayLogin = useMemo(() => allLogins.filter(n => new Date(n.created_at).toDateString() === todayStr), [allLogins, todayStr]);
    const allSyncs   = useMemo(() => notifications.filter(n => n.type === 'upload' && (n.message.includes('Editó') || n.message.includes('Sincronizó'))), [notifications]);
    const todaySyncs = useMemo(() => allSyncs.filter(n => new Date(n.created_at).toDateString() === todayStr), [allSyncs, todayStr]);

    const userActivity = useMemo(() => {
        const map: Record<string, { count: number; lastSeen: string; loginCount: number; syncCount: number; uploadCount: number }> = {};
        for (const n of notifications) {
            const u = n.actor_username; if (!u) continue;
            if (!map[u]) map[u] = { count: 0, lastSeen: n.created_at, loginCount: 0, syncCount: 0, uploadCount: 0 };
            map[u].count++;
            if (new Date(n.created_at) > new Date(map[u].lastSeen)) map[u].lastSeen = n.created_at;
            if (n.type === 'system' && n.message.includes('inició sesión')) map[u].loginCount++;
            if (n.type === 'upload' && (n.message.includes('Editó') || n.message.includes('Sincronizó'))) map[u].syncCount++;
            if (n.type === 'upload' && n.message.includes('Subió')) map[u].uploadCount++;
        }
        return Object.entries(map).map(([user, d]) => ({ user, ...d })).sort((a, b) => b.count - a.count);
    }, [notifications]);

    const maxUserCount = userActivity[0]?.count || 1;

    const dirActivity = useMemo(() => {
        const map: Record<string, { total: number; users: Set<string> }> = {};
        for (const n of notifications) {
            const p = extractPath(n.message); if (!p) continue;
            if (!map[p]) map[p] = { total: 0, users: new Set() };
            map[p].total++;
            if (n.actor_username) map[p].users.add(n.actor_username);
        }
        return Object.entries(map)
            .map(([path, d]) => ({ path, total: d.total, users: d.users.size }))
            .sort((a, b) => b.total - a.total);
    }, [notifications]);

    const maxDirCount = dirActivity[0]?.total || 1;

    const filteredLog = useMemo(() => {
        let base = notifications;
        if (logFilter === 'upload') base = base.filter(n => n.type === 'upload' && !n.message.includes('Editó') && !n.message.includes('Sincronizó'));
        if (logFilter === 'sync')   base = base.filter(n => n.type === 'upload' && (n.message.includes('Editó') || n.message.includes('Sincronizó')));
        if (logFilter === 'delete') base = base.filter(n => n.type === 'delete');
        if (logFilter === 'system') base = base.filter(n => n.type === 'system');
        return base.slice(0, 200);
    }, [notifications, logFilter]);

    const activeUsers = useMemo(() => new Set(notifications.map(n => n.actor_username).filter(Boolean)).size, [notifications]);

    // ── shared table row ──────────────────────────────────────────────────────
    const LogRow: React.FC<{ n: Notification }> = ({ n }) => {
        const badge = typeBadge(n.type, n.message);
        return (
            <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
                <span className="text-xs font-semibold text-gray-700 flex-shrink-0 w-24 truncate">{n.actor_username}</span>
                <span className="text-xs text-gray-500 flex-1 min-w-0 truncate" title={n.message}>{n.message}</span>
                <div className="text-right flex-shrink-0">
                    <div className="text-[11px] font-semibold text-gray-600">{fmtTime(n.created_at)}</div>
                    <div className="text-[10px] text-gray-400">{fmtDate(n.created_at)}</div>
                </div>
            </div>
        );
    };

    // ── tab content ───────────────────────────────────────────────────────────

    const TabResumen = () => (
        <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Accesos hoy"         value={todayLogin.length}  icon={<LogIn size={18} />}          colorCls="bg-blue-100 text-blue-600"    loading={loading} />
                <StatCard label="Eventos hoy"         value={todayAll.length}    icon={<Activity size={18} />}       colorCls="bg-violet-100 text-violet-600" loading={loading} />
                <StatCard label="Sincronizados hoy"   value={todaySyncs.length}  icon={<Upload size={18} />}         colorCls="bg-green-100 text-green-600"   loading={loading} />
                <StatCard label="Usuarios con acción" value={activeUsers}         icon={<Users size={18} />}          colorCls="bg-orange-100 text-orange-600" loading={loading} />
            </div>

            {/* Preview panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Top 5 users preview */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <TrendingUp size={15} className="text-violet-500" />
                            <span className="text-sm font-bold text-gray-800">Top usuarios</span>
                        </div>
                        <button onClick={() => setTab('usuarios')} className="text-[11px] text-violet-600 hover:underline">Ver todos →</button>
                    </div>
                    {loading ? <Skeleton rows={3} /> : userActivity.length === 0 ? <EmptyState msg="Sin datos" /> : (
                        <div className="space-y-3">
                            {userActivity.slice(0, 5).map((u, i) => (
                                <div key={u.user}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="flex items-center gap-1.5 font-semibold text-gray-800">
                                            <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-700 text-[9px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                            {u.user}
                                        </span>
                                        <span className="text-gray-500">{u.count} acciones</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-violet-400 rounded-full" style={{ width: `${(u.count / maxUserCount) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Top 5 directories preview */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <FolderOpen size={15} className="text-yellow-500" />
                            <span className="text-sm font-bold text-gray-800">Top directorios</span>
                        </div>
                        <button onClick={() => setTab('directorios')} className="text-[11px] text-violet-600 hover:underline">Ver todos →</button>
                    </div>
                    {loading ? <Skeleton rows={3} /> : dirActivity.length === 0 ? (
                        <EmptyState msg="Sin datos de directorio aún" sub="Se registran al subir, editar o sincronizar archivos" />
                    ) : (
                        <div className="space-y-3">
                            {dirActivity.slice(0, 5).map((d, i) => (
                                <div key={d.path}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="font-mono text-gray-700 truncate max-w-[180px]" title={d.path}>
                                            <span className="text-gray-400 mr-1">{i + 1}.</span>{d.path}
                                        </span>
                                        <span className="text-gray-500 flex-shrink-0 ml-2">{d.total} eventos</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${(d.total / maxDirCount) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Recent events preview */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <Clock size={14} className="text-gray-400" />
                        <span className="text-sm font-bold text-gray-800">Actividad reciente</span>
                    </div>
                    <button onClick={() => setTab('actividad')} className="text-[11px] text-violet-600 hover:underline">Ver todo →</button>
                </div>
                {loading ? <Skeleton rows={5} /> : (
                    <div className="divide-y divide-gray-50">
                        {notifications.slice(0, 8).map(n => <LogRow key={n.id} n={n} />)}
                    </div>
                )}
            </div>
        </div>
    );

    const TabUsuarios = () => (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2">
                    <TrendingUp size={15} className="text-violet-500" />
                    <span className="text-sm font-bold text-gray-800">Usuarios más activos</span>
                    <span className="text-xs text-gray-400">({userActivity.length} usuarios)</span>
                </div>
            </div>
            {loading ? <Skeleton rows={6} /> : userActivity.length === 0 ? <EmptyState msg="Sin datos de actividad" /> : (
                <div className="divide-y divide-gray-50">
                    {userActivity.map((u, i) => (
                        <div key={u.user} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                <span className="text-sm font-bold text-gray-900">{u.user}</span>
                                <div className="flex gap-1.5 ml-auto flex-wrap justify-end">
                                    {u.loginCount > 0 && (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{u.loginCount} accesos</span>
                                    )}
                                    {u.syncCount > 0 && (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">{u.syncCount} syncs</span>
                                    )}
                                    {u.uploadCount > 0 && (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{u.uploadCount} subidas</span>
                                    )}
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{u.count} total</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-violet-400 rounded-full transition-all" style={{ width: `${(u.count / maxUserCount) * 100}%` }} />
                                </div>
                                <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">
                                    Últ: {fmtDate(u.lastSeen)} {fmtTime(u.lastSeen)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const TabDirectorios = () => (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2">
                    <FolderOpen size={15} className="text-yellow-500" />
                    <span className="text-sm font-bold text-gray-800">Directorios más usados</span>
                    <span className="text-xs text-gray-400">({dirActivity.length} carpetas)</span>
                </div>
            </div>
            {loading ? <Skeleton rows={6} /> : dirActivity.length === 0 ? (
                <EmptyState msg="Sin datos de directorio aún" sub="Los directorios se registran al subir, editar o sincronizar archivos" />
            ) : (
                <div className="divide-y divide-gray-50">
                    {dirActivity.map((d, i) => (
                        <div key={d.path} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="w-6 h-6 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                <FolderOpen size={14} className="text-yellow-500 flex-shrink-0" />
                                <span className="text-sm font-semibold text-gray-800 font-mono truncate flex-1" title={d.path}>{d.path}</span>
                                <div className="flex gap-1.5 flex-shrink-0">
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">{d.total} eventos</span>
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{d.users} usuario{d.users !== 1 ? 's' : ''}</span>
                                </div>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden ml-9">
                                <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${(d.total / maxDirCount) * 100}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const TabAccesos = () => (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2">
                    <LogIn size={15} className="text-blue-500" />
                    <span className="text-sm font-bold text-gray-800">Historial de accesos</span>
                    <span className="text-xs text-gray-400">({allLogins.length} registros)</span>
                </div>
            </div>
            {loading ? <Skeleton rows={6} /> : allLogins.length === 0 ? <EmptyState msg="Sin registros de acceso" /> : (
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">#</th>
                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hora</th>
                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {allLogins.map((n, i) => (
                                <tr key={n.id} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="px-5 py-2.5 text-xs text-gray-400">{i + 1}</td>
                                    <td className="px-5 py-2.5 text-sm font-semibold text-gray-800">{n.actor_username}</td>
                                    <td className="px-5 py-2.5 text-xs text-gray-500">{fmtDate(n.created_at)}</td>
                                    <td className="px-5 py-2.5 text-xs font-mono font-semibold text-blue-600">{fmtTime(n.created_at)}</td>
                                    <td className="px-5 py-2.5">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${n.message.includes('inició') ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {n.message.includes('inició') ? '→ Entró' : '← Salió'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );

    const TabActividad = () => (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2 bg-gray-50">
                <div className="flex items-center gap-2">
                    <Clock size={14} className="text-gray-400" />
                    <span className="text-sm font-bold text-gray-800">Registro completo</span>
                    <span className="text-xs text-gray-400">({filteredLog.length})</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                    {LOG_FILTERS.map(f => (
                        <button
                            key={f.key}
                            onClick={() => setLogFilter(f.key)}
                            className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${logFilter === f.key ? 'bg-violet-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>
            {loading ? <Skeleton rows={8} /> : filteredLog.length === 0 ? <EmptyState msg="Sin eventos en esta categoría" /> : (
                <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                    {filteredLog.map(n => <LogRow key={n.id} n={n} />)}
                </div>
            )}
        </div>
    );

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <div className="max-w-6xl mx-auto py-6 px-4">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                        <Activity className="text-violet-600" size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Actividad del Sistema</h2>
                        <p className="text-xs text-gray-500">Accesos · usuarios activos · archivos sincronizados · directorios</p>
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

            {/* Tab bar */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            tab === t.key
                                ? 'bg-white text-violet-700 shadow-sm font-semibold'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                        }`}
                    >
                        {t.icon}
                        <span className="hidden sm:inline">{t.label}</span>
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {tab === 'resumen'     && <TabResumen />}
            {tab === 'usuarios'    && <TabUsuarios />}
            {tab === 'directorios' && <TabDirectorios />}
            {tab === 'accesos'     && <TabAccesos />}
            {tab === 'actividad'   && <TabActividad />}
        </div>
    );
};

export default ActivityDashboard;
