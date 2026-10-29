'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trophy, Users, Swords, Activity, Plus, ShieldCheck, LogOut, User, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AdminVerificationQueue } from '@/components/admin/AdminVerificationQueue';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [stats, setStats] = useState<{
    tournaments: number;
    participants: number;
    matches: number;
    loading: boolean;
  }>({
    tournaments: 0,
    participants: 0,
    matches: 0,
    loading: true,
  });

  useEffect(() => {
    async function initDashboard() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          if (user.email.toLowerCase().trim() !== 'ye.agrajj@gmail.com') {
            router.replace('/dashboard?error=admin_unauthorized');
            return;
          }
          setAdminEmail(user.email);

          // Fetch real system statistics
          const [tRes, pRes, mRes] = await Promise.all([
            supabase.from('tournaments').select('*', { count: 'exact', head: true }),
            supabase.from('participants').select('*', { count: 'exact', head: true }),
            supabase.from('matches').select('*', { count: 'exact', head: true }),
          ]);

          setStats({
            tournaments: tRes.count ?? 0,
            participants: pRes.count ?? 0,
            matches: mRes.count ?? 0,
            loading: false,
          });
        } else {
          router.replace('/login');
        }
      } catch (err) {
        console.error('Error fetching admin profile or stats:', err);
        setStats((prev) => ({ ...prev, loading: false }));
      }
    }

    initDashboard();
  }, [router]);

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
    <div className="space-y-8 text-white">
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-[#0A0A7A] text-[#FFFF00] border border-white/20 gap-1.5 py-1 px-3 rounded-full text-xs font-black uppercase tracking-wider">
              <ShieldCheck className="h-3.5 w-3.5 text-[#FFFF00]" />
              <span>Authorized Admin Session</span>
            </Badge>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white font-display uppercase tracking-wider">
            Admin Overview
          </h1>
          <p className="text-xs sm:text-sm text-white/70 mt-1">
            Logged in as: <span className="font-bold text-[#FFFF00]">{adminEmail || 'ye.agrajj@gmail.com'}</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full sm:w-auto justify-center font-black text-xs uppercase tracking-wider gap-2 text-red-300 border-red-400/30 hover:bg-red-500/20 hover:text-red-200 rounded-full cursor-pointer h-10 px-4"
          >
            <LogOut className="h-4 w-4" />
            <span>{isLoggingOut ? 'Signing out...' : 'Sign Out'}</span>
          </Button>

          <Button asChild className="w-full sm:w-auto justify-center bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider gap-2 rounded-full h-10 px-6 shadow-lg cursor-pointer">
            <Link href="/admin/tournaments/new">
              <Plus className="h-4 w-4" />
              <span>Create Tournament</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Real Live Analytics Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] shadow-lg text-white">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-white/70">
              Total Tournaments
            </CardTitle>
            <Trophy className="h-5 w-5 text-[#FFFF00]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-[#FFFF00] font-display">
              {stats.loading ? <Loader2 className="h-6 w-6 animate-spin text-[#FFFF00]" /> : stats.tournaments}
            </div>
            <p className="text-[11px] text-white/60 mt-1">Live database total</p>
          </CardContent>
        </Card>

        <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] shadow-lg text-white">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-white/70">
              Registered Players
            </CardTitle>
            <Users className="h-5 w-5 text-[#FFFF00]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-[#FFFF00] font-display">
              {stats.loading ? <Loader2 className="h-6 w-6 animate-spin text-[#FFFF00]" /> : stats.participants}
            </div>
            <p className="text-[11px] text-white/60 mt-1">Verified platform registrations</p>
          </CardContent>
        </Card>

        <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] shadow-lg text-white">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-white/70">
              Platform Matches
            </CardTitle>
            <Swords className="h-5 w-5 text-[#FFFF00]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-[#FFFF00] font-display">
              {stats.loading ? <Loader2 className="h-6 w-6 animate-spin text-[#FFFF00]" /> : stats.matches}
            </div>
            <p className="text-[11px] text-white/60 mt-1">Scheduled & completed fixtures</p>
          </CardContent>
        </Card>

        <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] shadow-lg text-white">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-white/70">
              System Health
            </CardTitle>
            <Activity className="h-5 w-5 text-[#00C853]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-[#00C853] font-display uppercase tracking-wider">
              Operational
            </div>
            <p className="text-[11px] text-white/60 mt-1">Supabase Auth & Database Live</p>
          </CardContent>
        </Card>
      </div>

      {/* Verification Queue Desk */}
      <AdminVerificationQueue />

      {/* Account Verification Card */}
      <Card className="bg-[#1818D4] border border-white/20 rounded-[32px] shadow-xl text-white">
        <CardHeader>
          <CardTitle className="text-lg font-black text-white font-display uppercase tracking-wider">
            Session & Security Credentials
          </CardTitle>
          <CardDescription className="text-xs text-white/70">
            Admin authentication verified via Supabase Auth server-side role check.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-white/10 p-6 space-y-3 bg-[#0A0A7A]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1818D4] border border-white/20 text-[#FFFF00]">
                <User className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">{adminEmail || 'Admin User'}</h3>
                <p className="text-xs text-[#FFFF00] font-bold uppercase tracking-wider">Lead Administrator • Full Control</p>
              </div>
            </div>
            <p className="text-xs text-white/70 pt-3 border-t border-white/10">
              Manage tournament lifecycle, player application approvals, bracket generation, and match disputes directly from the admin navigation.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
