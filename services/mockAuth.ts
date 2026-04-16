import { supabase } from './supabaseClient';
import { User, PermissionType } from '../types';

/**
 * AUTH SERVICE (SUPABASE INTEGRATION)
 * 
 * Target Table: accesook
 * Schema:
 *  - id: bigint (primary key)
 *  - username: text (unique)
 *  - password: text
 *  - user_metadata: jsonb (Stores fullName, role, avatarUrl, managedUsers, allowedFolders, sharedFiles, AND SYSTEM TOKENS)
 */

export const MockAuthService = {
  login: async (username: string, password: string): Promise<User> => {
    console.log("Attempting login for:", username);
    
    // 1. Query Supabase for the user credentials
    const { data, error } = await supabase
      .from('accesook')
      .select('*')
      .eq('username', username)
      .eq('password', password) // Note: In production, passwords should be hashed (e.g. bcrypt)
      .maybeSingle(); // Use maybeSingle to avoid error on 0 rows

    if (error) {
      console.error("Supabase Login Error:", error);
      if (error.code === '42501') {
          throw new Error('Error de permisos en Supabase (42501). Por favor ejecuta el script SQL de configuración en tu panel de Supabase para habilitar el acceso a la tabla "accesook".');
      }
      if (error.code === '42P01') {
          throw new Error('Error: La tabla "accesook" no existe (42P01). Por favor ejecuta el script SQL de creación de tabla en tu panel de Supabase.');
      }
      // Pass through the actual error message
      throw new Error(`Error de Supabase: ${error.message || 'Error desconocido'} (${error.code || 'No Code'})`);
    }

    if (!data) {
      throw new Error('Usuario o contraseña incorrectos');
    }

    // 2. Map database result to User type
    return {
        username: data.username,
        ...data.user_metadata,
        allowedFolders: data.user_metadata.allowedFolders || [],
        sharedFiles: data.user_metadata.sharedFiles || []
    } as User;
  },

  getUserByUsername: async (username: string): Promise<User | null> => {
     const { data, error } = await supabase
      .from('accesook')
      .select('*')
      .eq('username', username)
      .single();

     if (error || !data) return null;

     return {
         username: data.username,
         ...data.user_metadata,
         allowedFolders: data.user_metadata.allowedFolders || [],
         sharedFiles: data.user_metadata.sharedFiles || []
     } as User;
  },

  createUser: async (user: User, password: string): Promise<User> => {
    // Separate core auth fields from metadata
    const { username, ...metadata } = user;
    
    // Force mustChangePassword to true for new users
    const metadataWithAuthFlag = {
        ...metadata,
        mustChangePassword: true
    };

    const { data, error } = await supabase
        .from('accesook')
        .insert([
            { 
                username: username, 
                password: password,
                user_metadata: metadataWithAuthFlag 
            }
        ])
        .select()
        .single();

    if (error) {
        console.error("Supabase Create Error:", error);
        if (error.code === '23505') { // Unique violation code
            throw new Error('El nombre de usuario ya existe');
        }
        throw new Error('Error al crear usuario en base de datos: ' + error.message);
    }

    return {
        username: data.username,
        ...data.user_metadata,
        allowedFolders: data.user_metadata.allowedFolders || [],
        sharedFiles: data.user_metadata.sharedFiles || []
    } as User;
  },

  updateUser: async (username: string, updates: Partial<User>, newPassword?: string): Promise<User> => {
    // 1. Get current data to merge metadata correctly
    const { data: current, error: fetchError } = await supabase
        .from('accesook')
        .select('*')
        .eq('username', username)
        .single();
    
    if (fetchError || !current) throw new Error('El usuario no existe');

    const currentMetadata = current.user_metadata;
    
    // 2. Prepare updates (remove username from metadata if present to avoid duplication)
    const { username: ignored, ...metadataUpdates } = updates;
    const newMetadata = { ...currentMetadata, ...metadataUpdates };
    
    const dbUpdates: any = {
        user_metadata: newMetadata
    };
    if (newPassword && newPassword.trim() !== '') {
        dbUpdates.password = newPassword;
    }

    // 3. Perform Update
    const { data: updated, error: updateError } = await supabase
        .from('accesook')
        .update(dbUpdates)
        .eq('username', username)
        .select()
        .single();

    if (updateError) throw new Error('Error al actualizar usuario: ' + updateError.message);

    return {
        username: updated.username,
        ...updated.user_metadata,
        allowedFolders: updated.user_metadata.allowedFolders || [],
        sharedFiles: updated.user_metadata.sharedFiles || []
    } as User;
  },

  /**
   * Grants access to a specific path (Folder or File) for a target user.
   * This persists the share in the database.
   */
  grantAccess: async (targetUsername: string, resource: { path: string, type: 'folder' | 'file', permissions: PermissionType[] }): Promise<void> => {
      const user = await MockAuthService.getUserByUsername(targetUsername);
      if (!user) throw new Error("Usuario destino no encontrado");

      const updates: Partial<User> = {};

      if (resource.type === 'folder') {
          // Update allowedFolders
          const currentFolders = user.allowedFolders || [];
          // Remove existing rule for this path if exists to overwrite
          const others = currentFolders.filter(f => f.pathPrefix !== resource.path);
          
          // If permissions are empty, it means "remove access"
          if (resource.permissions.length === 0) {
              updates.allowedFolders = others;
          } else {
              updates.allowedFolders = [...others, { pathPrefix: resource.path, permissions: resource.permissions }];
          }
      } else {
          // Update sharedFiles
          const currentFiles = user.sharedFiles || [];
          const others = currentFiles.filter(f => f.path !== resource.path);
          
          if (resource.permissions.length === 0) {
              updates.sharedFiles = others;
          } else {
              updates.sharedFiles = [...others, { path: resource.path, permissions: resource.permissions }];
          }
      }

      await MockAuthService.updateUser(targetUsername, updates);
  },

  getUsers: async (): Promise<User[]> => {
    const { data, error } = await supabase
        .from('accesook')
        .select('*')
        // Filter out system config entry
        .neq('username', 'SYSTEM_DROPBOX_CONFIG')
        .order('id', { ascending: true });
    
    if (error) {
        console.error("Error fetching users:", error);
        return [];
    }

    return data.map((row: any) => ({
        username: row.username,
        ...row.user_metadata
    })) as User[];
  },

  deleteUser: async (username: string): Promise<void> => {
    // Prevent deletion of critical system admins
    if (username === 'admin' || username === 'salomon') {
        throw new Error('No se puede eliminar a este administrador (Protegido por sistema)');
    }

    const { error } = await supabase
        .from('accesook')
        .delete()
        .eq('username', username);

    if (error) throw new Error('Error al eliminar usuario: ' + error.message);
  },

  // Helper for local permission checking (Logic remains same, data source changed)
  hasPermission: (user: User, path: string, type: 'read' | 'write' | 'delete' | 'download'): boolean => {
    if (user.role === 'admin') return true;

    // Check Folders
    const matchingRule = user.allowedFolders.find(rule => 
      path.toLowerCase().startsWith(rule.pathPrefix.toLowerCase()) || rule.pathPrefix === '/'
    );
    if (matchingRule && matchingRule.permissions.includes(type)) return true;

    // Check specific files
    const matchingFile = user.sharedFiles?.find(f => f.path === path);
    if (matchingFile && matchingFile.permissions.includes(type)) return true;

    return false;
  },

  /**
   * Grants delete (and download) permission on multiple uploaded files at once.
   * Called after a successful upload so the uploader can delete their own files.
   * Returns the updated User object.
   */
  grantDeleteForUploadedFiles: async (username: string, filePaths: string[]): Promise<User> => {
      if (filePaths.length === 0) {
          const user = await MockAuthService.getUserByUsername(username);
          if (!user) throw new Error('Usuario no encontrado');
          return user;
      }

      const user = await MockAuthService.getUserByUsername(username);
      if (!user) throw new Error('Usuario no encontrado');

      const currentFiles = user.sharedFiles || [];
      const updatedFiles = [...currentFiles];

      for (const path of filePaths) {
          const existingIndex = updatedFiles.findIndex(f => f.path === path);
          if (existingIndex >= 0) {
              // Merge: add delete/download if not already present
              const merged = Array.from(new Set([
                  ...updatedFiles[existingIndex].permissions,
                  'read' as PermissionType,
                  'delete' as PermissionType,
                  'download' as PermissionType,
              ]));
              updatedFiles[existingIndex] = { ...updatedFiles[existingIndex], permissions: merged };
          } else {
              updatedFiles.push({ path, permissions: ['read', 'delete', 'download'] });
          }
      }

      return MockAuthService.updateUser(username, { sharedFiles: updatedFiles });
  },

  // --- GLOBAL SYSTEM CONFIG (DROPBOX TOKEN) ---
  
  /**
   * Retrieves the globally stored Dropbox token from Supabase.
   * This ensures all users use the same connection.
   */
  getGlobalDropboxToken: async (): Promise<{ accessToken: string, refreshToken?: string, expiresAt?: number } | null> => {
      const { data, error } = await supabase
          .from('accesook')
          .select('*')
          .eq('username', 'SYSTEM_DROPBOX_CONFIG')
          .maybeSingle();

      if (error || !data) return null;
      
      // Backward compatibility: if token is just a string
      const tokenData = data.user_metadata?.token;
      if (typeof tokenData === 'string') {
          return { accessToken: tokenData };
      }
      return tokenData || null;
  },

  /**
   * Saves the Dropbox token globally.
   */
  saveGlobalDropboxToken: async (tokenData: { accessToken: string, refreshToken?: string, expiresAt?: number } | string): Promise<void> => {
      // Upsert: Create or Update the special system user
      const { error } = await supabase
          .from('accesook')
          .upsert({
              username: 'SYSTEM_DROPBOX_CONFIG',
              password: 'system_config_entry_do_not_delete', 
              user_metadata: { 
                  token: tokenData, // Store the object directly
                  role: 'system',
                  fullName: 'System Configuration',
                  allowedFolders: []
              }
          }, { onConflict: 'username' });

      if (error) {
          console.error("Error saving global token:", error);
          throw new Error("Error guardando la conexión global");
      }
  },

  // --- INITIALIZATION HELPER ---
  initializeDefaultAdmin: async (): Promise<void> => {
      console.log("Checking for admin user...");
      
      // Use a simple select instead of HEAD/count to verify table access
      const { data: checkData, error: countError } = await supabase
        .from('accesook')
        .select('id')
        .limit(1);
        
      if (countError) {
          console.error("Connection Check Failed:", countError);
          if (countError.code === '42501') {
              throw new Error('Error de permisos en Supabase (42501). Por favor ejecuta el script SQL de configuración en tu panel de Supabase para habilitar el acceso a la tabla "accesook".');
          }
          const detailedError = countError.message || JSON.stringify(countError);
          if (detailedError.includes('Could not find the table') || detailedError.includes('42P01')) {
              throw new Error('Error: La tabla "accesook" no existe (42P01). Por favor ejecuta el script SQL de creación de tabla en tu panel de Supabase.');
          }
          if (detailedError === '{"message":""}' || !countError.message) {
               throw new Error('Error de conexión al verificar tabla: Respuesta vacía. Probablemente faltan políticas RLS (Row Level Security). Ejecuta el script SQL.');
          }
          
          throw new Error(`Error de conexión al verificar tabla: ${detailedError}`);
      }

      const { data, error } = await supabase
          .from('accesook')
          .select('*')
          .eq('username', 'admin')
          .maybeSingle();
      
      if (error) throw new Error(`Error buscando admin: ${error.message}`);

      if (data) {
          console.log("Admin user already exists.");
          return;
      }

      console.log("Creating default admin user...");
      const { error: insertError } = await supabase.from('accesook').insert([{
          username: 'admin',
          password: '123',
          user_metadata: {
              id: "u1",
              role: "admin",
              fullName: "Super Admin",
              avatarUrl: "https://i.pravatar.cc/150?u=admin",
              allowedFolders: [{pathPrefix: "/", permissions: ["read", "write", "delete", "download"]}],
              sharedFiles: []
          }
      }]);

      if (insertError) throw new Error("Error creating default admin: " + insertError.message);
  }
};