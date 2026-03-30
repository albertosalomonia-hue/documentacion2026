import React from 'react';
import { X, Download } from 'lucide-react';
import { DropboxFile } from '../types';

interface FilePreviewModalProps {
  file: DropboxFile;
  onClose: () => void;
  onDownload: (file: DropboxFile) => void;
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ file, onClose, onDownload }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Vista Previa: {file.name}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>
        <div className="text-center py-10">
          <p className="text-gray-600 mb-4">Vista previa no disponible para este tipo de archivo.</p>
          <button 
            onClick={() => onDownload(file)}
            className="bg-blue-600 text-white px-4 py-2 rounded flex items-center justify-center mx-auto hover:bg-blue-700"
          >
            <Download size={16} className="mr-2" /> Descargar
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;
