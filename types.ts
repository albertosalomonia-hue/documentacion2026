
export interface DropboxFile {
  id: string;
  name: string;
  path_lower: string;
  path_display: string;
  '.tag': 'file' | 'folder';
  size?: number;
  client_modified?: string;
  server_modified?: string;
  thumbnailUrl?: string; // Generated locally for preview
  tags?: string[]; // IDs of tags assigned to this file
}

export interface FileTag {
  id: string;
  label: string;
  color: string; // Hex code or Tailwind class suffix
}

export interface PlanGroup {
  name: string;
  count: number;
  files: DropboxFile[];
}

export interface AppState {
  currentPath: string;
  isLoading: boolean;
  files: DropboxFile[];
  isConnected: boolean;
  accessToken: string;
}

export enum ViewMode {
  Grid = 'GRID',
  List = 'LIST'
}

// --- Auth & Permissions Types ---

export type PermissionType = 'read' | 'write' | 'delete' | 'download';

export interface FolderPermission {
  pathPrefix: string; // e.g., "/architectural"
  permissions: PermissionType[];
}

export interface SharedFilePermission {
  path: string; // The specific file path
  permissions: PermissionType[];
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'jefe' | 'user';
  avatarUrl?: string;
  // Users managed by this user (only applicable if role is 'jefe')
  managedUsers?: string[]; // Array of usernames
  allowedFolders: FolderPermission[]; 
  sharedFiles?: SharedFilePermission[]; // Specific individual files shared with this user
  mustChangePassword?: boolean;
}

export interface UserSession {
  user: User;
  token?: string; // App-level dropbox token (simulated)
}

export interface Notification {
  id: number;
  created_at: string;
  type: 'upload' | 'delete' | 'permission' | 'system';
  message: string;
  actor_username: string;
  is_read: boolean;
}