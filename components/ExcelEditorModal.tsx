import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { X, Download, Save, Loader2, AlertCircle, FileSpreadsheet, Eye } from 'lucide-react';
import { DropboxFile } from '../types';

interface ExcelEditorModalProps {
  file: DropboxFile;
  onClose: () => void;
  onDownload: (file: DropboxFile) => void;
  getPreviewUrl: () => Promise<string>;
  onSave: (file: DropboxFile, blob: Blob) => Promise<void>;
  canEdit: boolean;
}

type CellValue = string | number | boolean | null;

const colLabel = (i: number): string => {
  let label = '';
  let n = i;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
};

// Read all cells from a worksheet into a 2D array, respecting the sheet's !ref range.
function wsToGrid(ws: XLSX.WorkSheet): CellValue[][] {
  const ref = ws['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: CellValue[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: CellValue[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) {
        row.push(null);
      } else if (cell.t === 'd') {
        // Date — use formatted string if available, else ISO string
        row.push(cell.w ?? (cell.v instanceof Date ? cell.v.toISOString().slice(0, 10) : String(cell.v)));
      } else {
        row.push(cell.v ?? null);
      }
    }
    rows.push(row);
  }
  return rows;
}

const ExcelEditorModal: React.FC<ExcelEditorModalProps> = ({
  file, onClose, onDownload, getPreviewUrl, onSave, canEdit,
}) => {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [sheetData, setSheetData] = useState<CellValue[][]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await getPreviewUrl();
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Error HTTP ${res.status} al obtener el archivo`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        const wb = XLSX.read(new Uint8Array(buffer), {
          type: 'array',
          cellDates: true,   // let wsToGrid handle dates explicitly
          cellNF: false,
          cellStyles: false,
        });

        if (!wb.SheetNames.length) throw new Error('El archivo no contiene hojas');

        const first = wb.SheetNames[0];
        const data = wsToGrid(wb.Sheets[first]);

        setWorkbook(wb);
        setActiveSheet(first);
        setSheetData(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Error desconocido al cargar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSheetChange = useCallback((name: string) => {
    if (!workbook || name === activeSheet) return;
    // Persist current edits into workbook before switching
    const updatedWb: XLSX.WorkBook = {
      ...workbook,
      Sheets: { ...workbook.Sheets, [activeSheet]: XLSX.utils.aoa_to_sheet(sheetData) },
    };
    const data = wsToGrid(updatedWb.Sheets[name]);
    setWorkbook(updatedWb);
    setActiveSheet(name);
    setSheetData(data);
  }, [workbook, activeSheet, sheetData]);

  const handleCellChange = useCallback((rIdx: number, cIdx: number, value: string) => {
    setSheetData(prev => {
      const next = prev.map(r => [...r]);
      while (next.length <= rIdx) next.push([]);
      while (next[rIdx].length <= cIdx) next[rIdx].push(null);
      const num = parseFloat(value);
      next[rIdx][cIdx] = value === '' ? null : (!isNaN(num) && String(num) === value ? num : value);
      return next;
    });
    setIsDirty(true);
  }, []);

  const handleSave = async () => {
    if (!workbook) return;
    setSaving(true);
    try {
      const updatedWb: XLSX.WorkBook = {
        ...workbook,
        Sheets: { ...workbook.Sheets, [activeSheet]: XLSX.utils.aoa_to_sheet(sheetData) },
      };
      const ext = file.name.split('.').pop()?.toLowerCase();
      const bookType: XLSX.BookType = ext === 'xls' ? 'xls' : 'xlsx';
      const wbout = XLSX.write(updatedWb, { bookType, type: 'array' });
      const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await onSave(file, blob);
      setWorkbook(updatedWb);
      setIsDirty(false);
    } catch (e: any) {
      alert('Error al guardar: ' + (e?.message ?? 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  // Column count: use existing data width, or min 10 columns when editing
  const dataColCount = sheetData.reduce((max, row) => Math.max(max, row.length), 0);
  const colCount = Math.max(dataColCount, canEdit ? 10 : 0);
  const totalRows = sheetData.length + (canEdit ? 5 : 0);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl w-full max-w-6xl shadow-2xl flex flex-col" style={{ height: '90vh' }}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileSpreadsheet className="text-green-600 flex-shrink-0" size={20} />
            <h2 className="text-base font-semibold text-gray-900 truncate" title={file.name}>
              {file.name}
            </h2>
            {isDirty && (
              <span className="ml-1 text-xs text-orange-500 font-normal flex-shrink-0">• Sin guardar</span>
            )}
            {!canEdit && !loading && !error && (
              <span className="ml-2 flex items-center gap-1 text-xs text-gray-400 font-normal flex-shrink-0">
                <Eye size={12} /> Solo lectura
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="flex items-center gap-1.5 text-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            )}
            <button
              onClick={() => onDownload(file)}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors"
            >
              <Download size={14} />
              Descargar
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Table area ── */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              <Loader2 className="animate-spin" size={36} />
              <span className="text-sm">Cargando archivo…</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-red-500">
              <AlertCircle size={36} />
              <p className="font-medium text-sm">No se pudo cargar el archivo</p>
              <p className="text-xs text-red-400 max-w-sm text-center">{error}</p>
            </div>
          )}

          {!loading && !error && workbook && colCount === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              <FileSpreadsheet size={36} className="opacity-30" />
              <p className="text-sm">Hoja vacía</p>
            </div>
          )}

          {!loading && !error && workbook && colCount > 0 && (
            <table className="border-collapse text-xs" style={{ minWidth: '100%' }}>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="border border-gray-300 bg-gray-200 px-2 py-1 w-10 min-w-[40px] text-center text-gray-500 font-normal sticky left-0 z-20 select-none" />
                  {Array.from({ length: colCount }, (_, i) => (
                    <th
                      key={i}
                      className="border border-gray-300 bg-gray-100 px-2 py-1 text-center text-gray-600 font-medium whitespace-nowrap"
                      style={{ minWidth: 90 }}
                    >
                      {colLabel(i)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: totalRows }, (_, rIdx) => {
                  const row = sheetData[rIdx] ?? [];
                  return (
                    <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="border border-gray-200 bg-gray-100 px-2 py-0 text-center text-gray-400 text-xs sticky left-0 z-10 select-none w-10 min-w-[40px]">
                        {rIdx + 1}
                      </td>
                      {Array.from({ length: colCount }, (_, cIdx) => {
                        const raw = row[cIdx];
                        const val = raw === undefined ? null : raw;
                        const display = val == null ? '' : String(val);
                        return (
                          <td key={cIdx} className="border border-gray-200 p-0">
                            {canEdit ? (
                              <input
                                type="text"
                                value={display}
                                onChange={e => handleCellChange(rIdx, cIdx, e.target.value)}
                                className="block w-full px-1.5 py-0.5 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-400 bg-transparent"
                                style={{ minWidth: 90, height: 24 }}
                              />
                            ) : (
                              <span
                                className="block px-1.5 py-0.5 whitespace-pre"
                                style={{ minWidth: 90, height: 24, lineHeight: '24px' }}
                              >
                                {display}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Sheet tabs ── */}
        {!loading && !error && workbook && (
          <div className="flex items-center gap-1 px-4 py-2 border-t border-gray-200 bg-gray-50 flex-shrink-0 overflow-x-auto">
            {workbook.SheetNames.map(name => (
              <button
                key={name}
                onClick={() => handleSheetChange(name)}
                className={`px-3 py-1 text-xs rounded border transition-colors whitespace-nowrap ${
                  name === activeSheet
                    ? 'bg-white border-gray-300 text-green-700 font-semibold shadow-sm'
                    : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExcelEditorModal;
