import { DropboxFile } from './types';

// MOCK DATA structure updated to support folder simulation
// Note: path_lower matches the folder structure

export const MOCK_ARCHITECTURAL_PLANS: DropboxFile[] = [
  { id: '1', name: 'A1.01 Site Plan', path_lower: '/architectural/a1.01', path_display: '/Architectural/A1.01', '.tag': 'file' },
  { id: '2', name: 'A1.02 Roof Site Plan', path_lower: '/architectural/a1.02', path_display: '/Architectural/A1.02', '.tag': 'file' },
  { id: '3', name: 'A2.01-1 Building 1 Floor Plan', path_lower: '/architectural/a2.01-1', path_display: '/Architectural/A2.01-1', '.tag': 'file' },
  { id: '4', name: 'A2.01-2 Building 2 Floor Plan', path_lower: '/architectural/a2.01-2', path_display: '/Architectural/A2.01-2', '.tag': 'file' },
  { id: '5', name: 'A2.01-3 Building 3 Floor Plan', path_lower: '/architectural/a2.01-3', path_display: '/Architectural/A2.01-3', '.tag': 'file' },
  { id: '6', name: 'A2.03-1 Building 1 Ceiling Plan', path_lower: '/architectural/a2.03-1', path_display: '/Architectural/A2.03-1', '.tag': 'file' },
  { id: '7', name: 'A2.03-2 Building 2 Ceiling Plan', path_lower: '/architectural/a2.03-2', path_display: '/Architectural/A2.03-2', '.tag': 'file' },
  { id: '8', name: 'A3.00 Site Sections & Elev', path_lower: '/architectural/a3.00', path_display: '/Architectural/A3.00', '.tag': 'file' },
];

export const MOCK_STRUCTURAL_PLANS: DropboxFile[] = [
  { id: 's1', name: 'S1.00 General Notes', path_lower: '/structural/s1.00', path_display: '/Structural/S1.00', '.tag': 'file' },
  { id: 's2', name: 'S1.01 Typical Details 1', path_lower: '/structural/s1.01', path_display: '/Structural/S1.01', '.tag': 'file' },
  { id: 's3', name: 'S1.02 Typical Details 2', path_lower: '/structural/s1.02', path_display: '/Structural/S1.02', '.tag': 'file' },
  { id: 's4', name: 'S2.01a Foundation/1st Floor', path_lower: '/structural/s2.01a', path_display: '/Structural/S2.01a', '.tag': 'file' },
];

export const MOCK_EXCEL_FILES: DropboxFile[] = [
  { id: 'e1', name: 'Presupuesto General 2024.xlsx', path_lower: '/admin/budget.xlsx', path_display: '/Admin/Budget.xlsx', '.tag': 'file' },
  { id: 'e2', name: 'Cronograma de Obra.csv', path_lower: '/admin/timeline.csv', path_display: '/Admin/Timeline.csv', '.tag': 'file' },
  { id: 'e3', name: 'Lista de Materiales.xlsx', path_lower: '/admin/materials.xlsx', path_display: '/Admin/Materials.xlsx', '.tag': 'file' },
];
