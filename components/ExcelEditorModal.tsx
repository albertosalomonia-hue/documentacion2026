import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { X, Download, Save, Loader2, AlertCircle, FileSpreadsheet } from 'lucide-react';
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        const first = wb.SheetNames[0];
        const data = XLSX.utils.sheet_to_json<CellValue[]>(wb.Sheets[first], {
          header: 1,
          defval: null,
        });

        setWorkbook(wb);
        setActiveSheet(first);
        setSheetData(data);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Error al cargar el archivo');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSheetChange = (name: string) => {
    if (!workbook || name === activeSheet) return;
    const updatedWb: XLSX.WorkBook = {
      ...workbook,
      Sheets: { ...workbook.Sheets, [activeSheet]: XLSX.utils.aoa_to_sheet(sheetData) },
    };
    const data = XLSX.utils.sheet_to_json<CellValue[]>(updatedWb.Sheets[name], {
      header: 1,
      defval: null,
    });
    setWorkbook(updatedWb);
    setActiveSheet(name);
    setSheetData(data);
  };

  const handleCellChange = (rIdx: number, cIdx: number, value: string) => {
    setSheetData(prev => {
      const next = prev.map(r => [...r]);
      while (next.length <= rIdx) next.push([]);
      while (next[rIdx].length <= cIdx) next[rIdx].push(null);
      const num = parseFloat(value);
      next[rIdx][cIdx] = value === '' ? null : (!isNaN(num) && String(num) === value ? num : value);
      return next;
    });
    setIsDirty(true);
  };

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

  const colCount = Math.max(...sheetData.map(r => r.length), canEdit ? 10 : 0, 0);
  const totalRows = sheetData.length + (canEdit ? 5 : 0);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl w-full max-w-6xl shadow-2xl flex flex-col" style={{ height: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileSpreadsheet className="text-green-600 flex-shrink-0" size={20} />
            <h2 className="text-base font-semibold text-gray-900 truncate" title={file.name}>
              {file.name}
            </h2>
            {isDirty && (
              <span className="ml-1 text-xs text-orange-500 font-normal flex-shrink-0">• Sin guardar</span>
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

        {/* Table area */}
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
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && workbook && (
            <table className="border-collapse text-xs w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="border border-gray-300 bg-gray-200 px-2 py-1 w-10 text-center text-gray-500 font-normal sticky left-0 z-20 select-none" />
                  {Array.from({ length: colCount }, (_, i) => (
                    <th
                      key={i}
                      className="border border-gray-300 bg-gray-100 px-2 py-1 text-center text-gray-600 font-medium min-w-[90px] whitespace-nowrap"
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
                    <tr key={rIdx} className="hover:bg-blue-50/20">
                      <td className="border border-gray-200 bg-gray-100 px-2 py-0.5 text-center text-gray-500 sticky left-0 z-10 select-none w-10">
                        {rIdx + 1}
                      </td>
                      {Array.from({ length: colCount }, (_, cIdx) => {
                        const val = row[cIdx] ?? null;
                        return (
                          <td key={cIdx} className="border border-gray-200 p-0">
                            {canEdit ? (
                              <input
                                type="text"
                                value={val == null ? '' : String(val)}
                                onChange={e => handleCellChange(rIdx, cIdx, e.target.value)}
                                className="w-full px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400 bg-transparent min-w-[90px] h-full"
                              />
                            ) : (
                              <span className="block px-1.5 py-0.5 min-w-[90px]">
                                {val == null ? '' : String(val)}
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

        {/* Sheet tabs */}
        {!loading && !error && workbook && workbook.SheetNames.length > 0 && (
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
