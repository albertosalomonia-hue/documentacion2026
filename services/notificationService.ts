import { supabase } from './supabaseClient';
import { Notification } from '../types';

export const NotificationService = {
  create: async (
    type: 'upload' | 'delete' | 'permission' | 'system',
    message: string,
    actor_username: string
  ): Promise<void> => {
    try {
      const { error } = await supabase
        .from('notifications')
        .insert([{ type, message, actor_username, is_read: false }]);

      if (error) {
        console.error('Error creating notification:', error);
      }
    } catch (err) {
      console.error('Error in NotificationService.create:', err);
    }
  },

  getAll: async (): Promise<Notification[]> => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching notifications:', error);
        return [];
      }
      return data as Notification[];
    } catch (err) {
      console.error('Error in NotificationService.getAll:', err);
      return [];
    }
  },

  markAsRead: async (id: number): Promise<void> => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (error) {
        console.error('Error marking notification as read:', error);
      }
    } catch (err) {
      console.error('Error in NotificationService.markAsRead:', err);
    }
  },

  markAllAsRead: async (): Promise<void> => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('is_read', false);

      if (error) {
        console.error('Error marking all notifications as read:', error);
      }
    } catch (err) {
      console.error('Error in NotificationService.markAllAsRead:', err);
    }
  },

  clearAll: async (): Promise<void> => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .neq('id', 0); // Delete all

      if (error) {
        console.error('Error clearing notifications:', error);
      }
    } catch (err) {
      console.error('Error in NotificationService.clearAll:', err);
    }
  }
};
