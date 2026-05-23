import React, { useState, useEffect } from 'react';
import { X, Download, Loader2, AlertCircle, FileSpreadsheet, ExternalLink } from 'lucide-react';
import { DropboxFile } from '../types';

interface ExcelEditorModalProps {
  file: DropboxFile;
  onClose: () => void;
  onDownload: (file: DropboxFile) => void;
  getPreviewUrl: () => Promise<string>;
  onSave: (file: DropboxFile, blob: Blob) => Promise<void>;
  canEdit: boolean;
}

const OFFICE_VIEWER = 'https://view.officeapps.live.com/op/embed.aspx?src=';

const ExcelEditorModal: React.FC<ExcelEditorModalProps> = ({
  file, onClose, onDownload, getPreviewUrl,
}) => {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await getPreviewUrl();
        if (!cancelled) {
          setEmbedUrl(OFFICE_VIEWER + encodeURIComponent(url));
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'No se pudo obtener el enlace del archivo');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openInNewTab = () => {
    if (embedUrl) window.open(embedUrl.replace('/embed.aspx?', '/view.aspx?'), '_blank');
  };

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
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            <button
              onClick={openInNewTab}
              disabled={!embedUrl}
              className="flex items-center gap-1.5 text-sm text-green-700 hover:text-green-900 px-3 py-1.5 rounded-lg border border-green-200 hover:bg-green-50 transition-colors disabled:opacity-40"
            >
              <ExternalLink size={14} />
              Abrir en pestaña
            </button>
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

        {/* Content */}
        <div className="flex-1 relative overflow-hidden rounded-b-xl">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400">
              <Loader2 className="animate-spin" size={36} />
              <span className="text-sm">Cargando Excel Online…</span>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-red-500">
              <AlertCircle size={36} />
              <p className="font-medium text-sm">No se pudo cargar el archivo</p>
              <p className="text-xs text-red-400 max-w-sm text-center">{error}</p>
            </div>
          )}

          {embedUrl && !error && (
            <iframe
              src={embedUrl}
              className="w-full h-full border-0"
              title={file.name}
              allow="clipboard-read; clipboard-write"
              onLoad={() => setLoading(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ExcelEditorModal;
