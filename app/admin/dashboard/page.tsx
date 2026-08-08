'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, Users, Swords, Activity, Plus, ShieldCheck, LogOut, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    async function fetchUser() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setAdminEmail(user.email);
        }
      } catch (err) {
        console.error('Error fetching admin profile:', err);
      }
    }

    fetchUser();
  }, []);

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
    <div className="space-y-8">
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="efootball" className="gap-1 py-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Authenticated Session</span>
            </Badge>
          </div>
          <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
            Admin Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Logged in as: <span className="font-semibold text-[#0B3323]">{adminEmail || 'Admin User'}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="font-bold gap-2 text-destructive border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
          >
            <LogOut className="h-4 w-4" />
            <span>{isLoggingOut ? 'Logging out...' : 'Logout'}</span>
          </Button>

          <Button className="font-bold gap-2">
            <Plus className="h-4 w-4" />
            <span>Create Tournament</span>
          </Button>
        </div>
      </div>

      {/* Analytics Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="hover:border-primary/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">
              Total Tournaments
            </CardTitle>
            <Trophy className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0B3323]">12</div>
            <p className="text-[11px] text-muted-foreground mt-1">+2 created this month</p>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">
              Registered Players
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0B3323]">256</div>
            <p className="text-[11px] text-muted-foreground mt-1">Across all divisions</p>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">
              Active Matches
            </CardTitle>
            <Swords className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0B3323]">8</div>
            <p className="text-[11px] text-muted-foreground mt-1">Pending score verification</p>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">
              System Health
            </CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">Operational</div>
            <p className="text-[11px] text-muted-foreground mt-1">Supabase Auth & DB Active</p>
          </CardContent>
        </Card>
      </div>

      {/* Account Verification Card */}
      <Card>
        <CardHeader>
          <CardTitle>Session & Role Information</CardTitle>
          <CardDescription>
            Admin authentication status verified via Supabase Auth SSR session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border p-6 space-y-3 bg-secondary/30">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B3323] text-primary">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-[#0B3323]">{adminEmail || 'Admin User'}</h3>
                <p className="text-xs text-muted-foreground">Administrator • Full Access</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
              Tournament CRUD, participant registration, bracket generation, and match score management will be enabled in subsequent steps.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
