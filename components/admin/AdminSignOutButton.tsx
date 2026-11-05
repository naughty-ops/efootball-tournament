'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export default function AdminSignOutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="w-full sm:w-auto justify-center font-black text-xs uppercase tracking-wider gap-2 text-red-300 border-red-400/30 hover:bg-red-500/20 hover:text-red-200 rounded-full cursor-pointer h-10 px-4"
    >
      <LogOut className="h-4 w-4" />
      <span>{isLoggingOut ? 'Signing out...' : 'Sign Out'}</span>
    </Button>
  );
}
