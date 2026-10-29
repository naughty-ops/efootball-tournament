'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  ShieldCheck,
  Trophy,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  XCircle,
  Phone,
  Gamepad2,
  Loader2,
  ArrowUpRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { AdminVerificationQueue } from '@/components/admin/AdminVerificationQueue';
import { cn } from '@/lib/utils';

interface ParticipantRecord {
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  username: string;
  realName: string | null;
  contactInfo: string | null;
  seedNumber: number | null;
  status: 'pending' | 'confirmed' | 'rejected' | 'withdrawn';
  createdAt: string;
}

export default function AdminParticipantsPage() {
  const [activeTab, setActiveTab] = useState<'verification' | 'roster'>('verification');
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');

  useEffect(() => {
    async function fetchRoster() {
      setIsLoadingRoster(true);
      try {
        const supabase = createClient();
        const { data: partData, error } = await supabase
          .from('participants')
          .select('id, tournament_id, username, real_name, contact_info, seed_number, status, created_at, tournaments(title)')
          .order('created_at', { ascending: false });

        if (!error && partData) {
          const records: ParticipantRecord[] = partData.map((p: any) => ({
            id: p.id,
            tournamentId: p.tournament_id,
            tournamentTitle: p.tournaments?.title || 'Unknown Tournament',
            username: p.username,
            realName: p.real_name,
            contactInfo: p.contact_info,
            seedNumber: p.seed_number,
            status: p.status,
            createdAt: p.created_at,
          }));
          setParticipants(records);
        }
      } catch (err) {
        console.error('Error fetching tournament participants:', err);
      } finally {
        setIsLoadingRoster(false);
      }
    }

    if (activeTab === 'roster' && participants.length === 0) {
      fetchRoster();
    }
  }, [activeTab, participants.length]);

  const filteredRoster = participants.filter((p) => {
    if (!rosterSearch.trim()) return true;
    const q = rosterSearch.toLowerCase().trim();
    return (
      p.username.toLowerCase().includes(q) ||
      (p.realName || '').toLowerCase().includes(q) ||
      p.tournamentTitle.toLowerCase().includes(q) ||
      (p.contactInfo || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-[#0A0A7A] text-[#FFFF00] border border-white/20 gap-1.5 py-1 px-3 rounded-full text-xs font-black uppercase tracking-wider">
              <ShieldCheck className="h-3.5 w-3.5 text-[#FFFF00]" />
              <span>Player Compliance & Roster</span>
            </Badge>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white font-display uppercase tracking-wider">
            Participant & Member Management
          </h1>
          <p className="text-xs sm:text-sm text-white/70 mt-1">
            Review user identity verifications, approve WhatsApp submissions, and audit tournament player rosters.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center bg-[#0A0A7A] p-1 rounded-full border border-white/20 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('verification')}
            className={cn(
              'px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all cursor-pointer',
              activeTab === 'verification'
                ? 'bg-[#FFFF00] text-[#08088F] shadow'
                : 'text-white/70 hover:text-white'
            )}
          >
            Verification Desk
          </button>
          <button
            onClick={() => setActiveTab('roster')}
            className={cn(
              'px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all cursor-pointer',
              activeTab === 'roster'
                ? 'bg-[#FFFF00] text-[#08088F] shadow'
                : 'text-white/70 hover:text-white'
            )}
          >
            Tournament Roster
          </button>
        </div>
      </div>

      {/* Verification Desk Tab */}
      {activeTab === 'verification' && (
        <AdminVerificationQueue />
      )}

      {/* Tournament Roster Tab */}
      {activeTab === 'roster' && (
        <Card className="bg-[#1818D4] border border-white/20 rounded-[32px] shadow-xl text-white overflow-hidden">
          <CardHeader className="pb-4 border-b border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-black font-display uppercase tracking-wider text-white">
                  Tournament Registrations Roster
                </CardTitle>
                <CardDescription className="text-xs text-white/70">
                  All active, pending, and confirmed competitor entries across platform tournaments.
                </CardDescription>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                <Input
                  type="text"
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder="Filter roster..."
                  className="pl-9 pr-3 h-9 rounded-full bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 text-xs focus-visible:ring-[#FFFF00]"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {isLoadingRoster ? (
              <div className="py-16 text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00] mx-auto" />
                <p className="text-xs text-white/70 font-bold uppercase tracking-wider">
                  Loading participant records...
                </p>
              </div>
            ) : filteredRoster.length === 0 ? (
              <div className="py-16 text-center rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-3">
                <Users className="h-10 w-10 text-white/40 mx-auto" />
                <h3 className="font-bold text-base text-white">No Registrations Found</h3>
                <p className="text-xs text-white/60 max-w-sm mx-auto">
                  {rosterSearch ? 'No participants matched your search.' : 'No tournament participants registered yet.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full min-w-[650px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-white/60 font-black uppercase tracking-wider text-[10px]">
                      <th className="pb-3 px-3">Player Name & eFootball ID</th>
                      <th className="pb-3 px-3">Tournament</th>
                      <th className="pb-3 px-3">Contact</th>
                      <th className="pb-3 px-3">Seed</th>
                      <th className="pb-3 px-3">Status</th>
                      <th className="pb-3 px-3 text-right">Registered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredRoster.map((p) => {
                      const playerName = p.realName?.trim() || p.username;

                      return (
                        <tr key={p.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-bold text-white text-sm">{playerName}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] font-mono font-bold text-[#FFFF00] bg-[#0A0A7A] px-2 py-0.5 rounded-md border border-white/20">
                                ID: {p.username}
                              </span>
                            </div>
                          </td>
                        <td className="py-3 px-3">
                          <Link
                            href={`/admin/tournaments/${p.tournamentId}`}
                            className="text-[#FFFF00] hover:underline flex items-center gap-1 font-semibold"
                          >
                            <span>{p.tournamentTitle}</span>
                            <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </td>
                        <td className="py-3 px-3 font-mono text-white/80">
                          {p.contactInfo || '—'}
                        </td>
                        <td className="py-3 px-3 font-bold">
                          {p.seedNumber !== null ? `#${p.seedNumber}` : 'Unseeded'}
                        </td>
                        <td className="py-3 px-3">
                          {p.status === 'confirmed' ? (
                            <Badge className="bg-[#00C853]/20 text-[#00E676] border border-[#00C853]/30 text-[10px] font-bold py-0">
                              Confirmed
                            </Badge>
                          ) : p.status === 'pending' ? (
                            <Badge className="bg-[#FFFF00]/20 text-[#FFFF00] border border-[#FFFF00]/30 text-[10px] font-bold py-0">
                              Pending
                            </Badge>
                          ) : p.status === 'rejected' ? (
                            <Badge className="bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold py-0">
                              Rejected
                            </Badge>
                          ) : (
                            <Badge className="bg-white/10 text-white/60 border border-white/20 text-[10px] font-bold py-0">
                              {p.status}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right text-white/50">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
