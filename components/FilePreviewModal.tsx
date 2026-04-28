import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Loader2, FileText, AlertCircle } from 'lucide-react';
import { DropboxFile } from '../types';

interface FilePreviewModalProps {
  file: DropboxFile;
  onClose: () => void;
  onDownload: (file: DropboxFile) => void;
  getPreviewUrl: () => Promise<string>;
}

const IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
const PDF_TYPES   = ['pdf'];
const VIDEO_TYPES = ['mp4', 'webm', 'mov', 'avi'];
const AUDIO_TYPES = ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac'];
const TEXT_TYPES  = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'sql', 'yaml', 'yml', 'log', 'toml', 'ini', 'cfg'];

const getExt = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ file, onClose, onDownload, getPreviewUrl }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const blobRef = useRef<string | null>(null);

  const ext = getExt(file.name);
  const isImage = IMAGE_TYPES.includes(ext);
  const isPdf   = PDF_TYPES.includes(ext);
  const isVideo = VIDEO_TYPES.includes(ext);
  const isAudio = AUDIO_TYPES.includes(ext);
  const isText  = TEXT_TYPES.includes(ext);
  const canPreview = isImage || isPdf || isVideo || isAudio || isText;

  useEffect(() => {
    if (!canPreview) { setLoading(false); return; }

    let cancelled = false;

    (async () => {
      try {
        const url = await getPreviewUrl();
        if (cancelled) return;

        if (isText) {
          // Fetch the text content directly
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          if (!cancelled) { setTextContent(text); setLoading(false); }

        } else if (isPdf) {
          // Fetch as blob to bypass Content-Disposition: attachment in iframes
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const burl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          blobRef.current = burl;
          if (!cancelled) { setObjectUrl(burl); setLoading(false); }

        } else {
          // Images, video, audio: direct URL works fine in <img>/<video>/<audio>
          if (!cancelled) { setObjectUrl(url); setLoading(false); }
        }
      } catch (e: any) {
        if (!cancelled) {
          setErrorMsg(e?.message ?? 'Error desconocido');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
    };
  }, []);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
          <Loader2 className="animate-spin" size={36} />
          <span className="text-sm">Cargando vista previa…</span>
        </div>
      );
    }

    if (errorMsg) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-500">
          <AlertCircle size={36} />
          <p className="text-sm font-medium">No se pudo cargar la vista previa</p>
          <p className="text-xs text-red-400">{errorMsg}</p>
        </div>
      );
    }

    if (!canPreview) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
          <FileText size={48} className="opacity-40" />
          <p className="text-sm">Vista previa no disponible para archivos <strong>.{ext || 'de este tipo'}</strong>.</p>
          <p className="text-xs">Descarga el archivo para abrirlo.</p>
        </div>
      );
    }

    if (isImage && objectUrl) {
      return (
        <div className="flex items-center justify-center min-h-40">
          <img
            src={objectUrl}
            alt={file.name}
            className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm"
            onError={() => setErrorMsg('No se pudo mostrar la imagen.')}
          />
        </div>
      );
    }

    if (isPdf && objectUrl) {
      return (
        <iframe
          src={objectUrl}
          className="w-full rounded border-0"
          style={{ height: '72vh' }}
          title={file.name}
        />
      );
    }

    if (isVideo && objectUrl) {
      return (
        <video
          src={objectUrl}
          controls
          className="w-full max-h-[70vh] rounded-lg"
          onError={() => setErrorMsg('No se pudo reproducir el video.')}
        />
      );
    }

    if (isAudio && objectUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-40 gap-4">
          <audio
            src={objectUrl}
            controls
            className="w-full max-w-lg"
            onError={() => setErrorMsg('No se pudo reproducir el audio.')}
          />
        </div>
      );
    }

    if (isText) {
      return (
        <pre className="bg-gray-50 rounded-lg p-4 overflow-auto max-h-[70vh] text-xs text-gray-800 font-mono whitespace-pre-wrap break-words leading-relaxed">
          {textContent ?? '(archivo vacío)'}
        </pre>
      );
    }

    return null;
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900 truncate mr-4" title={file.name}>
            {file.name}
          </h2>
          <div className="flex items-center gap-2 flex-shrink-0">
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

        {/* Preview area */}
        <div className="flex-1 overflow-auto p-5">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;
