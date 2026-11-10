'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function markNotificationReadAction(notificationId: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, message: 'Unauthorized' };
    }

    const { error } = await (supabase
      .from('player_notifications') as any)
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, message: error.message };
    }

    revalidatePath('/dashboard/notifications');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to update notification' };
  }
}

export async function markAllNotificationsReadAction() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, message: 'Unauthorized' };
    }

    const { error } = await (supabase
      .from('player_notifications') as any)
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) {
      return { success: false, message: error.message };
    }

    revalidatePath('/dashboard/notifications');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to update notifications' };
  }
}
