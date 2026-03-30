import React, { useState } from 'react';
import { DropboxFile, FileTag, PermissionType } from '../types';
import { Trash2, Folder as FolderIcon, ArrowRight, FileText, FileSpreadsheet, Image as ImageIcon, Share2, Users, Lock, Edit2, Download } from 'lucide-react';
import { DropboxService } from '../services/dropboxService';

interface PlanCardProps {
  file: DropboxFile;
  onClick: (file: DropboxFile) => void;
  onDragStart: (file: DropboxFile) => void;
  onDragEnd: () => void;
  onDelete?: (file: DropboxFile) => void;
  onAssignTag?: (file: DropboxFile) => void;
  onShare?: (file: DropboxFile) => void;
  onDownload?: (file: DropboxFile) => void;
  onMove?: (sourceFile: DropboxFile, targetFolder: DropboxFile) => void;
  canDelete?: boolean;
  allTags?: FileTag[];
  draggedFile?: DropboxFile | null;
  sharedWithCount?: number; 
  effectivePermissions?: PermissionType[];
}

const getFileIcon = (fileName: string) => {
    if (fileName.match(/\.(xlsx|xls|csv)$/i)) return <FileSpreadsheet className="text-green-600" size={20} />;
    if (fileName.match(/\.(jpg|jpeg|png|gif)$/i)) return <ImageIcon className="text-purple-600" size={20} />;
    return <FileText className="text-blue-500" size={20} />;
};

const PlanCard: React.FC<PlanCardProps> = ({ 
    file, 
    onClick, 
    onDragStart, 
    onDragEnd, 
    onDelete, 
    onAssignTag,
    onShare,
    onDownload,
    onMove,
    canDelete = false, 
    allTags = [],
    draggedFile,
    sharedWithCount = 0,
    effectivePermissions = []
}) => {
  const isFolder = file['.tag'] === 'folder';
  const isOfficeFile = file.name.match(/\.(xlsx|xls|docx|doc|pptx)$/i);
  const [isDragOver, setIsDragOver] = useState(false);

  const nameParts = file.name.split(' ');
  const code = isFolder ? '' : nameParts[0];
  const description = isFolder ? file.name : (nameParts.slice(1).join(' ') || 'Untitled Plan');

  const hash = file.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = hash % 360;

  const fileTags = allTags.filter(t => file.tags?.includes(t.id));

  const handleDeleteClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onDelete) onDelete(file);
  };

  const handleShareClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onShare) onShare(file);
  };

  const handleDownloadClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onDownload) onDownload(file);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      if (onAssignTag) onAssignTag(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
      if (isFolder && draggedFile && draggedFile.id !== file.id) {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(true);
      }
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
      if (isFolder && draggedFile && draggedFile.id !== file.id) {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
          if (onMove) onMove(draggedFile, file);
      }
  };

  return (
    <div 
        draggable
        onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', file.id);
            e.dataTransfer.effectAllowed = 'move';
            onDragStart(file);
        }}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => onClick(file)}
        onContextMenu={handleContextMenu}
        className={`group relative bg-white border rounded shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col h-40 active:opacity-50 
            ${isFolder ? 'border-yellow-200 bg-yellow-50/30' : 'border-gray-200'}
            ${isDragOver ? 'ring-4 ring-blue-400 scale-105 z-10 bg-blue-50' : ''}
        `}
    >
        <div className={`flex-1 relative overflow-hidden p-2 flex items-center justify-center ${isDragOver ? 'bg-blue-100' : (isFolder ? 'bg-yellow-50' : 'bg-gray-50')}`}>
             
             {isFolder ? (
                 <div className="relative">
                    <FolderIcon size={48} className={`${isDragOver ? 'text-blue-500 fill-blue-100' : 'text-yellow-500 fill-yellow-100'}`} />
                    {isDragOver && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <ArrowRight className="text-white drop-shadow-md" size={24} />
                        </div>
                    )}
                 </div>
             ) : (
                 <>
                    <div 
                    className="absolute inset-2 opacity-20 border-2 border-dashed border-blue-800"
                    style={{ transform: `rotate(${hash % 5}deg)` }}
                    ></div>
                    <div 
                        className="w-full h-full bg-white border border-blue-100 flex items-center justify-center text-blue-200"
                    >
                        <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" stroke={`hsl(${hue}, 60%, 40%)`} strokeWidth="0.5">
                            <rect x="10" y="10" width="80" height="80" />
                            <line x1="10" y1="10" x2="90" y2="90" />
                            <line x1="90" y1="10" x2="10" y2="90" />
                            <circle cx="50" cy="50" r="20" />
                        </svg>
                    </div>
                 </>
             )}

             {/* TAGS OVERLAY */}
             <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[80%]">
                 {fileTags.map(tag => (
                     <div 
                        key={tag.id} 
                        className="w-3 h-3 rounded-full shadow-sm ring-1 ring-white"
                        style={{ backgroundColor: tag.color }}
                        title={tag.label}
                     />
                 ))}
             </div>
             
             {/* PERMISSIONS INDICATOR (Visual Feedback) */}
             <div className="absolute bottom-2 right-2 flex space-x-0.5">
                 {!effectivePermissions.includes('write') && (
                     <span className="bg-gray-100 text-gray-500 p-0.5 rounded shadow-sm border border-gray-200" title="Solo Lectura">
                         <Lock size={10} />
                     </span>
                 )}
                 {effectivePermissions.includes('download') && (
                     <span className="bg-green-50 text-green-600 p-0.5 rounded shadow-sm border border-green-100" title="Descarga permitida">
                         <Download size={10} />
                     </span>
                 )}
                 {effectivePermissions.includes('write') && (
                     <span className="bg-blue-50 text-blue-500 p-0.5 rounded shadow-sm border border-blue-100" title="Escritura">
                         <Edit2 size={10} />
                     </span>
                 )}
                 {effectivePermissions.includes('delete') && (
                     <span className="bg-red-50 text-red-500 p-0.5 rounded shadow-sm border border-red-100" title="Eliminar">
                         <Trash2 size={10} />
                     </span>
                 )}
             </div>

             {/* Shared Indicator */}
             {sharedWithCount > 0 && (
                 <div className="absolute bottom-2 left-2 flex items-center bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm" title={`Compartido con ${sharedWithCount} usuarios`}>
                     <Users size={10} className="mr-1"/> {sharedWithCount}
                 </div>
             )}

             {/* ACTION BUTTONS (Hover) */}
             <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all z-20">
                 
                 {/* Download Button */}
                 {onDownload && effectivePermissions.includes('download') && !isFolder && (
                     <button 
                        onClick={handleDownloadClick}
                        className="p-1.5 bg-white text-gray-400 hover:text-green-600 hover:bg-green-50 rounded shadow-sm border border-gray-200"
                        title="Descargar"
                     >
                         <Download size={14} />
                     </button>
                 )}

                 {/* Share Button (Allow for folders too) */}
                 {onShare && (
                     <button 
                        onClick={handleShareClick}
                        className="p-1.5 bg-white text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded shadow-sm border border-gray-200"
                        title="Compartir"
                     >
                         <Share2 size={14} />
                     </button>
                 )}

                 {/* Delete Button */}
                 {canDelete && !isDragOver && (
                     <button 
                        onClick={handleDeleteClick}
                        className="p-1.5 bg-white text-gray-400 hover:text-red-600 hover:bg-red-50 rounded shadow-sm border border-gray-200"
                        title="Eliminar"
                     >
                         <Trash2 size={14} />
                     </button>
                 )}
             </div>
        </div>

        <div className={`h-14 px-3 flex flex-col justify-center rounded-b ${isDragOver ? 'bg-blue-500 border-t border-blue-600' : (isFolder ? 'bg-yellow-100 border-t border-yellow-200' : 'bg-zinc-900 text-white')}`}>
            {isFolder ? (
                <div className={`font-bold text-sm truncate flex items-center ${isDragOver ? 'text-white' : 'text-yellow-900'}`}>
                    {isDragOver ? 'Mover aquí' : description}
                </div>
            ) : (
                <>
                    <div className="font-bold text-sm truncate">{code}</div>
                    <div className="text-xs text-gray-400 truncate">{description}</div>
                </>
            )}
        </div>
    </div>
  );
};

export const PlanListItem: React.FC<PlanCardProps> = ({
    file,
    onClick,
    onDragStart,
    onDragEnd,
    onDelete,
    onAssignTag,
    onShare,
    onDownload,
    onMove,
    canDelete = false,
    allTags = [],
    draggedFile,
    sharedWithCount = 0,
    effectivePermissions = []
}) => {
    const isFolder = file['.tag'] === 'folder';
    const isOfficeFile = file.name.match(/\.(xlsx|xls|docx|doc|pptx)$/i);
    const [isDragOver, setIsDragOver] = useState(false);
    
    const handleDragOver = (e: React.DragEvent) => {
        if (isFolder && draggedFile && draggedFile.id !== file.id) {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        if (isFolder && draggedFile && draggedFile.id !== file.id) {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
            if (onMove) onMove(draggedFile, file);
        }
    };

    const fileTags = allTags.filter(t => file.tags?.includes(t.id));

    return (
        <tr 
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', file.id);
                e.dataTransfer.effectAllowed = 'move';
                onDragStart(file);
            }}
            onDragEnd={onDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => onClick(file)}
            onContextMenu={(e) => { e.preventDefault(); if (onAssignTag) onAssignTag(file); }}
            className={`
                border-b border-gray-100 cursor-pointer transition-colors
                ${isDragOver ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 bg-white'}
                ${isFolder ? 'font-medium' : ''}
            `}
        >
            <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                    <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center mr-3 relative">
                        {isFolder ? 
                            <FolderIcon className={`${isDragOver ? 'text-blue-500 fill-blue-100' : 'text-yellow-500 fill-yellow-100'}`} size={24} /> : 
                            getFileIcon(file.name)
                        }
                        {!effectivePermissions.includes('write') && (
                             <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow border border-gray-100"><Lock size={8} className="text-gray-400"/></div>
                        )}
                    </div>
                    <div>
                        <div className={`text-sm ${isFolder ? 'text-gray-900' : 'text-gray-700'}`}>{file.name}</div>
                        {isDragOver && <div className="text-xs text-blue-600 font-bold">Soltar para mover</div>}
                    </div>
                </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {file.size ? (file.size / 1024).toFixed(1) + ' KB' : '-'}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {file.client_modified ? new Date(file.client_modified).toLocaleDateString() : '-'}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex space-x-1 items-center">
                    {fileTags.map(tag => (
                        <span key={tag.id} className="w-2 h-2 rounded-full" style={{backgroundColor: tag.color}} title={tag.label}></span>
                    ))}
                    {sharedWithCount > 0 && (
                        <span className="flex items-center bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] ml-1">
                            <Users size={8} className="mr-1"/> {sharedWithCount}
                        </span>
                    )}
                </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div className="flex justify-end space-x-2">
                    
                    {effectivePermissions.includes('download') && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); if(onDownload) onDownload(file); }}
                            className="text-gray-400 hover:text-green-600 transition-colors p-1"
                            title="Descargar"
                        >
                            <Download size={16} />
                        </button>
                    )}
                    {onShare && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); if(onShare) onShare(file); }}
                            className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                            title="Compartir"
                        >
                            <Share2 size={16} />
                        </button>
                    )}
                    {canDelete && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); if (onDelete) onDelete(file); }} 
                            className="text-gray-400 hover:text-red-600 transition-colors p-1"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

export const AddPlanCard: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    return (
        <div 
            onClick={onClick}
            className="group relative border-2 border-dashed border-gray-300 rounded flex flex-col h-40 items-center justify-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition"
        >
            <div className="text-4xl text-gray-300 mb-1 group-hover:text-gray-400">+</div>
            <div className="text-sm text-gray-400 font-medium group-hover:text-gray-500">Subir Archivos</div>
        </div>
    )
}

export default PlanCard;