'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  X,
  Check,
  Sparkles,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { selectPlayerAvatarAction, getActiveAvatarsAction } from '@/app/actions/avatarActions';
import type { Avatar, Profile } from '@/types/database';
import { DEFAULT_AVATAR_URL } from '@/lib/avatar/constants';

interface AvatarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatarId?: string | null;
  currentAvatarUrl?: string | null;
  onAvatarSelected: (newAvatarUrl: string, newAvatarId: string) => void;
}

export default function AvatarPickerModal({
  isOpen,
  onClose,
  currentAvatarId,
  currentAvatarUrl,
  onAvatarSelected,
}: AvatarPickerModalProps) {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Load active avatars on open
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      const res = await getActiveAvatarsAction();
      if (!mounted) return;
      setLoading(false);

      if (res.success && res.data) {
        setAvatars(res.data);
        // Pre-select current avatar or first
        if (currentAvatarId) {
          const matched = res.data.find((a) => a.id === currentAvatarId);
          if (matched) setSelectedAvatar(matched);
        } else if (currentAvatarUrl) {
          const matched = res.data.find((a) => a.image_url === currentAvatarUrl);
          if (matched) setSelectedAvatar(matched);
        }
      } else {
        setError(res.error || 'Failed to load official avatars.');
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [isOpen, currentAvatarId, currentAvatarUrl]);

  if (!isOpen) return null;

  // Extract unique categories
  const categories = ['all', ...Array.from(new Set(avatars.map((a) => a.category).filter(Boolean)))];

  // Filter avatars
  const filteredAvatars = avatars.filter((av) => {
    if (selectedCategory !== 'all' && av.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      return av.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const handleSave = async () => {
    if (!selectedAvatar) return;
    setSaving(true);
    setError(null);

    const res = await selectPlayerAvatarAction(selectedAvatar.id);
    setSaving(false);

    if (!res.success) {
      setError(res.error || 'Failed to update avatar.');
      return;
    }

    onAvatarSelected(selectedAvatar.image_url, selectedAvatar.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-[32px] bg-[#0A0A7A] border border-white/20 p-5 sm:p-7 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={saving}
          className="absolute right-5 top-5 p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1 pr-8">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-[#FFFF00]/10 text-[#FFFF00]">
              <Sparkles className="w-4 h-4" />
            </span>
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white font-display">
              Choose Player Avatar
            </h2>
          </div>
          <p className="text-xs text-white/60">
            Select an official admin-approved competitor avatar to represent your profile on tournament leaderboards and brackets.
          </p>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Search & Category Tabs */}
        <div className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search avatars by name..."
              className="bg-[#050550] border-white/15 text-white placeholder:text-white/40 pl-10 text-xs rounded-xl h-10 focus:border-[#FFFF00]"
            />
          </div>

          {categories.length > 2 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => {
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`text-xs px-3 py-1.5 rounded-full font-bold capitalize transition-all border ${
                      isActive
                        ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00]'
                        : 'bg-white/5 hover:bg-white/10 text-white/70 border-white/10'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Avatar Gallery Scrollable Body */}
        <div className="flex-1 overflow-y-auto mt-4 pr-1 py-1 space-y-4">
          {loading ? (
            <div className="py-16 text-center space-y-2 text-white/60">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#FFFF00]" />
              <p className="text-xs">Loading official avatars...</p>
            </div>
          ) : filteredAvatars.length === 0 ? (
            <div className="py-12 text-center text-white/50 text-xs">
              No avatars found matching your search.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {filteredAvatars.map((avatar) => {
                const isSelected = selectedAvatar?.id === avatar.id;
                return (
                  <button
                    type="button"
                    key={avatar.id}
                    onClick={() => setSelectedAvatar(avatar)}
                    className={`relative p-3 rounded-2xl border transition-all text-left flex flex-col items-center gap-2.5 group cursor-pointer ${
                      isSelected
                        ? 'bg-[#1818D4] border-[#FFFF00] shadow-[0_0_20px_rgba(255,255,0,0.3)] ring-2 ring-[#FFFF00]'
                        : 'bg-[#050550] border-white/10 hover:border-white/30 hover:bg-[#07076B]'
                    }`}
                  >
                    {/* Selected Badge */}
                    {isSelected && (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#FFFF00] text-[#08088F] flex items-center justify-center shadow-md animate-in zoom-in-50 duration-150">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}

                    {/* Image Circle Frame */}
                    <div
                      className={`relative w-20 h-20 sm:w-22 sm:h-22 rounded-full overflow-hidden bg-black/40 border-2 transition-transform duration-200 group-hover:scale-105 ${
                        isSelected ? 'border-[#FFFF00]' : 'border-white/20'
                      }`}
                    >
                      <Image
                        src={avatar.image_url}
                        alt={avatar.name}
                        fill
                        sizes="100px"
                        className="object-cover"
                      />
                    </div>

                    <div className="text-center w-full">
                      <p
                        className={`text-xs font-bold truncate max-w-full ${
                          isSelected ? 'text-[#FFFF00]' : 'text-white'
                        }`}
                      >
                        {avatar.name}
                      </p>
                      <span className="text-[10px] text-white/50 block capitalize">
                        {avatar.category}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Selection Preview & Action Bar */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {selectedAvatar ? (
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-[#FFFF00] bg-black/40 shrink-0">
                <Image
                  src={selectedAvatar.image_url}
                  alt={selectedAvatar.name}
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              </div>
              <div className="text-left">
                <span className="text-[10px] text-white/50 uppercase tracking-wider block font-bold">
                  Selected Avatar
                </span>
                <span className="text-xs font-bold text-white">{selectedAvatar.name}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-white/50 italic">
              Please click an avatar above to select.
            </div>
          )}

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="border-white/20 bg-transparent text-white hover:bg-white/10 text-xs rounded-xl h-10 px-4"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !selectedAvatar}
              className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-xl h-10 px-5 shadow-lg gap-2 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Save Avatar</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
