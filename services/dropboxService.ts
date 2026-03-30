import { DropboxFile } from '../types';

const DROPBOX_API_BASE = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT_BASE = 'https://content.dropboxapi.com/2';

// Safely get the Client ID handling environments where process might be undefined
const getClientId = () => {
  try {
    // Try accessing env var if available (Next.js/Webpack/Vite)
    return process.env.NEXT_PUBLIC_DROPBOX_APP_KEY || 'kah385bksv0g6ic';
  } catch (e) {
    // Fallback if 'process' is not defined (Raw browser environment)
    return 'kah385bksv0g6ic';
  }
};

const CLIENT_ID = getClientId();

// PKCE Helpers
function dec2hex(dec: number) {
  return ('0' + dec.toString(16)).substr(-2);
}

function generateCodeVerifier() {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return Array.from(array, dec2hex).join('');
}

async function generateCodeChallenge(verifier: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  
  const bytes = new Uint8Array(digest);
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export const getDropboxAuthUrl = async () => {
  if (!CLIENT_ID) {
    console.error("Dropbox Client ID is missing");
    return '#';
  }
  
  let redirectUri = '';

  if (typeof window !== 'undefined') {
      redirectUri = window.location.origin + '/';
  }

  // Generate PKCE Verifier and Challenge
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  // Store verifier in localStorage for the callback
  if (typeof window !== 'undefined') {
      localStorage.setItem('dropbox_code_verifier', verifier);
  }

  console.log('Using Dropbox Redirect URI:', redirectUri); 
  
  // Use 'code' flow with offline access (Refresh Token)
  return `https://www.dropbox.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&token_access_type=offline&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${challenge}&code_challenge_method=S256`;
};

export const parseAuthCodeFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('code');
};

// Legacy support for implicit flow (just in case)
export const parseAuthTokenFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash.substring(1));
  return params.get('access_token');
};

export class DropboxService {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  // Exchange Authorization Code for Access Token + Refresh Token
  static async exchangeCodeForToken(code: string): Promise<{ access_token: string, refresh_token: string, expires_in: number, account_id: string }> {
      const verifier = localStorage.getItem('dropbox_code_verifier');
      if (!verifier) throw new Error("No PKCE verifier found");

      const redirectUri = window.location.origin + '/';
      
      const params = new URLSearchParams();
      params.append('code', code);
      params.append('grant_type', 'authorization_code');
      params.append('client_id', CLIENT_ID);
      params.append('redirect_uri', redirectUri);
      params.append('code_verifier', verifier);

      const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params
      });

      if (!response.ok) {
          const err = await response.text();
          throw new Error(`Token exchange failed: ${err}`);
      }

      const data = await response.json();
      localStorage.removeItem('dropbox_code_verifier'); // Cleanup
      return data;
  }

  // Refresh Access Token using Refresh Token
  static async refreshAccessToken(refreshToken: string): Promise<{ access_token: string, expires_in: number }> {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', refreshToken);
      params.append('client_id', CLIENT_ID);

      const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params
      });

      if (!response.ok) {
          const err = await response.text();
          throw new Error(`Token refresh failed: ${err}`);
      }

      return await response.json();
  }

  private async request(endpoint: string, body: any = null, base: string = DROPBOX_API_BASE) {
    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };

    try {
      const response = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : null,
      });

      if (response.status === 401) {
        // Token expired or invalid
        throw new Error('Unauthorized: Invalid Access Token');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error_summary: response.statusText }));
        // Handle specific Dropbox error structures
        const errorSummary = typeof errorData === 'string' ? errorData : (errorData.error_summary || JSON.stringify(errorData));
        throw new Error(errorSummary || 'Dropbox API Error');
      }

      return await response.json();
    } catch (error) {
      console.error('Dropbox API Request Failed:', error);
      throw error;
    }
  }

  async listFiles(path: string = ''): Promise<DropboxFile[]> {
    try {
      let allEntries: DropboxFile[] = [];
      let hasMore = true;
      let cursor: string | null = null;

      while (hasMore) {
          const endpoint = cursor ? '/files/list_folder/continue' : '/files/list_folder';
          const body = cursor ? { cursor } : {
            path: path === '/' ? '' : path,
            recursive: false,
            include_media_info: true,
            include_deleted: false,
            include_has_explicit_shared_members: false,
            include_mounted_folders: true,
            limit: 2000
          };

          const response = await this.request(endpoint, body);
          allEntries = [...allEntries, ...response.entries];
          hasMore = response.has_more;
          cursor = response.cursor;
      }

      return allEntries as DropboxFile[];
    } catch (e) {
      console.error("Error listing files:", e);
      throw e;
    }
  }

  /**
   * Recursively list all folders in the Dropbox account.
   * Useful for permission assignment dropdowns.
   */
  async listAllFolders(): Promise<DropboxFile[]> {
    try {
      const response = await this.request('/files/list_folder', {
        path: '',
        recursive: true, // Key change: get everything recursive
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: false,
        include_mounted_folders: true,
        limit: 2000 // Higher limit to get full structure
      });

      const allEntries = response.entries as DropboxFile[];
      // Filter only folders on the client side
      return allEntries.filter(f => f['.tag'] === 'folder');
    } catch (e) {
      console.error("Error listing all folders recursive:", e);
      // Fallback: Just return root folders if recursive fails (e.g. too large)
      try {
          const rootFiles = await this.listFiles('');
          return rootFiles.filter(f => f['.tag'] === 'folder');
      } catch (inner) {
          return [];
      }
    }
  }

  /**
   * Helper to safely stringify JSON for HTTP headers (ASCII only).
   * Encodes non-ASCII characters to unicode escape sequences.
   */
  private toDropboxApiArg(data: any): string {
      return JSON.stringify(data).replace(/[\u007f-\uffff]/g, (c) => { 
          return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); 
      });
  }

  /**
   * Uploads a file to Dropbox.
   * @param path The base directory path OR full path if manual path construction is needed.
   * @param file The file object.
   * @param explicitPath (Optional) If provided, this is the exact full path (including filename) to use.
   */
  async uploadFile(path: string, file: File, explicitPath?: string): Promise<DropboxFile> {
    
    // Determine the full destination path
    // If explicitPath is provided (e.g. for recursive folder uploads), use it.
    // Otherwise, construct from base path + filename.
    const dropboxPath = explicitPath 
        ? explicitPath 
        : (path === '/' ? `/${file.name}` : `${path}/${file.name}`);

    // Dropbox requires header values to be ASCII.
    // We use toDropboxApiArg to handle special characters (accents, emojis, etc.) in the path.
    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': this.toDropboxApiArg({
        path: dropboxPath,
        mode: 'overwrite', // Changed from 'add' to 'overwrite' to prevent duplicates
        autorename: false, // Changed to false so it replaces the existing file
        mute: false
      }),
    };

    const response = await fetch(`${DROPBOX_CONTENT_BASE}/files/upload`, {
      method: 'POST',
      headers,
      body: file,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Upload failed: ${err}`);
    }

    return await response.json();
  }

  async deleteFile(path: string): Promise<void> {
    await this.request('/files/delete_v2', {
      path: path
    });
  }

  async createFolder(path: string): Promise<DropboxFile> {
    const response = await this.request('/files/create_folder_v2', {
      path,
      autorename: true
    });
    return response.metadata;
  }

  async moveFile(fromPath: string, toPath: string): Promise<DropboxFile> {
    const response = await this.request('/files/move_v2', {
        from_path: fromPath,
        to_path: toPath,
        autorename: true,
        allow_shared_folder: true,
        allow_ownership_transfer: true
    });
    return response.metadata;
  }

  async getTemporaryLink(path: string): Promise<string> {
    const response = await this.request('/files/get_temporary_link', {
      path
    });
    return response.link;
  }

  /**
   * Generates a link to open the file in the Dropbox Web Interface.
   * This is required for Office Online Co-authoring.
   */
  getWebUrl(file: DropboxFile): string {
      // Logic: https://www.dropbox.com/home/FOLDER_PATH?preview=FILENAME
      // path_display usually looks like "/Folder/File.ext"
      if (!file.path_display) return 'https://www.dropbox.com/home';
      
      const parts = file.path_display.split('/');
      const fileName = parts.pop(); // Remove file name
      const folderPath = parts.join('/'); // Rejoin folder path

      // If root
      if (folderPath === '') {
          return `https://www.dropbox.com/home?preview=${encodeURIComponent(fileName || '')}`;
      }

      return `https://www.dropbox.com/home${folderPath}?preview=${encodeURIComponent(fileName || '')}`;
  }
}