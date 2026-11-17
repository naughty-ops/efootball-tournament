'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Link as LinkIcon, Image as ImageIcon, Type, Sparkles } from 'lucide-react';

interface VisualFormProps {
  sectionKey: string;
  content: Record<string, any>;
  onChange: (updated: Record<string, any>) => void;
}

export function HomepageVisualForms({ sectionKey, content, onChange }: VisualFormProps) {
  const updateField = (key: string, value: any) => {
    onChange({ ...content, [key]: value });
  };

  switch (sectionKey) {
    case 'announcements':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-[#FFFF00] flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Badge Label
              </label>
              <Input
                value={content.badge_text || ''}
                onChange={(e) => updateField('badge_text', e.target.value)}
                placeholder="e.g. SEASON 2026"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-[#D9DCFF] flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5" />
                Headline Text
              </label>
              <Input
                value={content.headline || ''}
                onChange={(e) => updateField('headline', e.target.value)}
                placeholder="e.g. Kerala eFootball Championship Open: Register your ID today!"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-[#D9DCFF]">
                Button Label
              </label>
              <Input
                value={content.cta_label || ''}
                onChange={(e) => updateField('cta_label', e.target.value)}
                placeholder="Register Now"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-[#D9DCFF] flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" />
                Button Target URL
              </label>
              <Input
                value={content.cta_url || ''}
                onChange={(e) => updateField('cta_url', e.target.value)}
                placeholder="/tournaments?status=registration"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
          </div>
        </div>
      );

    case 'hero_banner':
      return (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-[#FFFF00]">
              Category Tagline
            </label>
            <Input
              value={content.tagline || ''}
              onChange={(e) => updateField('tagline', e.target.value)}
              placeholder="OFFICIAL COMPETITIVE ARENA"
              className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-white">
                Main Headline
              </label>
              <Input
                value={content.title_main || ''}
                onChange={(e) => updateField('title_main', e.target.value)}
                placeholder="THE PITCH"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold font-display"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-[#FFFF00]">
                Highlighted Words
              </label>
              <Input
                value={content.title_highlight || ''}
                onChange={(e) => updateField('title_highlight', e.target.value)}
                placeholder="IS OURS"
                className="bg-[#0E0EB5] border-white/15 text-[#FFFF00] rounded-xl text-xs font-bold font-display"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-[#D9DCFF]">
              Description Subtitle
            </label>
            <textarea
              value={content.subtitle || ''}
              onChange={(e) => updateField('subtitle', e.target.value)}
              rows={3}
              placeholder="Konami eFootball official tournament platform..."
              className="w-full rounded-xl bg-[#0E0EB5] border border-white/15 p-3 text-xs text-white leading-relaxed font-medium focus:outline-hidden focus:border-[#FFFF00]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-[#0A0A7A] border border-white/10">
            <div className="space-y-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#FFFF00]">
                Primary Button
              </span>
              <div className="space-y-2">
                <Input
                  value={content.primary_button_label || ''}
                  onChange={(e) => updateField('primary_button_label', e.target.value)}
                  placeholder="Button Label (Join Tournaments)"
                  className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs"
                />
                <Input
                  value={content.primary_button_url || ''}
                  onChange={(e) => updateField('primary_button_url', e.target.value)}
                  placeholder="Target URL (/tournaments)"
                  className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-white">
                Secondary Button
              </span>
              <div className="space-y-2">
                <Input
                  value={content.secondary_button_label || ''}
                  onChange={(e) => updateField('secondary_button_label', e.target.value)}
                  placeholder="Button Label (Watch Arena)"
                  className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs"
                />
                <Input
                  value={content.secondary_button_url || ''}
                  onChange={(e) => updateField('secondary_button_url', e.target.value)}
                  placeholder="Target URL (/live)"
                  className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Stadium Card Visual */}
          <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#FF168B] flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" />
              Right-side Stadium Card & Visual
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/70">Badge</label>
                <Input
                  value={content.stadium_badge || ''}
                  onChange={(e) => updateField('stadium_badge', e.target.value)}
                  placeholder="HOT TOURNAMENT"
                  className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/70">Title</label>
                <Input
                  value={content.stadium_title || ''}
                  onChange={(e) => updateField('stadium_title', e.target.value)}
                  placeholder="SEASON 3 ARENA"
                  className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs font-display"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/70">Subtitle</label>
                <Input
                  value={content.stadium_subtitle || ''}
                  onChange={(e) => updateField('stadium_subtitle', e.target.value)}
                  placeholder="eFootball 2026"
                  className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-white/70">Stadium Artwork Image Path / URL</label>
              <Input
                value={content.stadium_image || ''}
                onChange={(e) => updateField('stadium_image', e.target.value)}
                placeholder="/images/banners/efootball-stadium.webp"
                className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs font-mono"
              />
            </div>
          </div>
        </div>
      );

    case 'arena_1v1':
      const tiers = Array.isArray(content.tiers) ? content.tiers : [];
      const handleUpdateTier = (index: number, key: string, val: any) => {
        const next = [...tiers];
        next[index] = { ...next[index], [key]: val };
        updateField('tiers', next);
      };

      const handleAddTier = () => {
        updateField('tiers', [
          ...tiers,
          { name: 'New Arena', badge: 'Tier', entry_inr: 20, prize_inr: 35 },
        ]);
      };

      const handleRemoveTier = (index: number) => {
        updateField('tiers', tiers.filter((_: any, i: number) => i !== index));
      };

      return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-[#FF168B]">Tag Badge</label>
              <Input
                value={content.badge || ''}
                onChange={(e) => updateField('badge', e.target.value)}
                placeholder="1 VS 1 ARENA"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-[#00E676]">Pill 1 Text</label>
              <Input
                value={content.pill1_text || ''}
                onChange={(e) => updateField('pill1_text', e.target.value)}
                placeholder="Instant 24/7 Matchmaking"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-[#FFFF00]">Pill 2 Text</label>
              <Input
                value={content.pill2_text || ''}
                onChange={(e) => updateField('pill2_text', e.target.value)}
                placeholder="Instant Wallet Prize Payouts"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-white">
                Main Headline
              </label>
              <Input
                value={content.title_main || ''}
                onChange={(e) => updateField('title_main', e.target.value)}
                placeholder="HEAD-TO-HEAD BATTLES"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold font-display"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-[#FFFF00]">
                Highlight Headline
              </label>
              <Input
                value={content.title_highlight || ''}
                onChange={(e) => updateField('title_highlight', e.target.value)}
                placeholder="PLAY ANYTIME, WIN REAL PRIZES"
                className="bg-[#0E0EB5] border-white/15 text-[#FFFF00] rounded-xl text-xs font-bold font-display"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-[#D9DCFF]">
              Subtitle
            </label>
            <textarea
              value={content.subtitle || ''}
              onChange={(e) => updateField('subtitle', e.target.value)}
              rows={2}
              placeholder="Skip scheduled tournament waiting. Jump straight into fast-paced 1v1 eFootball matches..."
              className="w-full rounded-xl bg-[#0E0EB5] border border-white/15 p-3 text-xs text-white leading-relaxed font-medium focus:outline-hidden focus:border-[#FFFF00]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-white/80">CTA Label</label>
              <Input
                value={content.cta_label || ''}
                onChange={(e) => updateField('cta_label', e.target.value)}
                placeholder="Play 1 VS 1 Now"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-white/80">CTA URL</label>
              <Input
                value={content.cta_url || ''}
                onChange={(e) => updateField('cta_url', e.target.value)}
                placeholder="/dashboard/matches?mode=1v1"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-mono"
              />
            </div>
          </div>

          {/* Tiers List */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#FFFF00]">
                Featured Challenge Tiers ({tiers.length})
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTier}
                className="h-7 text-xs border-white/20 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Add Tier
              </Button>
            </div>

            <div className="space-y-2.5">
              {tiers.map((tier: any, i: number) => (
                <div
                  key={i}
                  className="p-3 rounded-2xl bg-[#08088F] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
                    <Input
                      value={tier.name || ''}
                      onChange={(e) => handleUpdateTier(i, 'name', e.target.value)}
                      placeholder="Tier Name (e.g. Rookie)"
                      className="bg-[#0E0EB5] border-white/10 text-white rounded-lg text-xs"
                    />
                    <Input
                      value={tier.badge || ''}
                      onChange={(e) => handleUpdateTier(i, 'badge', e.target.value)}
                      placeholder="Badge (e.g. HOT)"
                      className="bg-[#0E0EB5] border-white/10 text-white rounded-lg text-xs"
                    />
                    <Input
                      type="number"
                      value={tier.entry_inr ?? 10}
                      onChange={(e) => handleUpdateTier(i, 'entry_inr', Number(e.target.value))}
                      placeholder="Entry ₹"
                      className="bg-[#0E0EB5] border-white/10 text-white rounded-lg text-xs"
                    />
                    <Input
                      type="number"
                      value={tier.prize_inr ?? 15}
                      onChange={(e) => handleUpdateTier(i, 'prize_inr', Number(e.target.value))}
                      placeholder="Prize ₹"
                      className="bg-[#0E0EB5] border-white/10 text-[#00E676] rounded-lg text-xs font-bold"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveTier(i)}
                    className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case 'featured_tournament':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-[#FFFF00]">Tag</label>
              <Input
                value={content.tag || ''}
                onChange={(e) => updateField('tag', e.target.value)}
                placeholder="FEATURED COMPETITION"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-[#FF168B]">Badge</label>
              <Input
                value={content.badge || ''}
                onChange={(e) => updateField('badge', e.target.value)}
                placeholder="STAGE 1"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-white">Competition Title</label>
            <Input
              value={content.title || ''}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="Kerala eFootball Masters"
              className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold font-display"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-[#D9DCFF] flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" />
              Banner Artwork Image Path / URL
            </label>
            <Input
              value={content.image || ''}
              onChange={(e) => updateField('image', e.target.value)}
              placeholder="/images/banners/efootball-championship.webp"
              className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-[#D9DCFF]">Button Label</label>
              <Input
                value={content.cta_label || ''}
                onChange={(e) => updateField('cta_label', e.target.value)}
                placeholder="Special Player List & Rules"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-[#D9DCFF]">Button Target URL</label>
              <Input
                value={content.cta_url || ''}
                onChange={(e) => updateField('cta_url', e.target.value)}
                placeholder="/tournaments"
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-mono"
              />
            </div>
          </div>
        </div>
      );

    case 'upcoming_tournaments':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-[#0A0A7A] border border-white/10">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-[#FFFF00]">Active Column Title</label>
              <Input
                value={content.active_title || ''}
                onChange={(e) => updateField('active_title', e.target.value)}
                placeholder="Active Tournaments"
                className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-[#D9DCFF]">Max Active Display Count</label>
              <Input
                type="number"
                value={content.max_active ?? 5}
                onChange={(e) => updateField('max_active', Number(e.target.value))}
                min={1}
                max={20}
                className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-[#0A0A7A] border border-white/10">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-[#FFFF00]">Upcoming Column Title</label>
              <Input
                value={content.upcoming_title || ''}
                onChange={(e) => updateField('upcoming_title', e.target.value)}
                placeholder="Upcoming"
                className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-[#D9DCFF]">Max Upcoming Display Count</label>
              <Input
                type="number"
                value={content.max_upcoming ?? 4}
                onChange={(e) => updateField('max_upcoming', Number(e.target.value))}
                min={1}
                max={20}
                className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-[#0A0A7A] border border-white/10">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-[#FFFF00]">Completed Column Title</label>
              <Input
                value={content.completed_title || ''}
                onChange={(e) => updateField('completed_title', e.target.value)}
                placeholder="Recent Champions & Completed Tournaments"
                className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-[#D9DCFF]">Max Completed Display Count</label>
              <Input
                type="number"
                value={content.max_completed ?? 6}
                onChange={(e) => updateField('max_completed', Number(e.target.value))}
                min={1}
                max={20}
                className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs font-bold"
              />
            </div>
          </div>
        </div>
      );

    case 'platform_statistics':
      const statsList = Array.isArray(content.stats) ? content.stats : [];
      const handleUpdateStat = (idx: number, field: string, val: string) => {
        const next = [...statsList];
        next[idx] = { ...next[idx], [field]: val };
        updateField('stats', next);
      };
      const handleAddStat = () => {
        updateField('stats', [...statsList, { label: 'New Metric', value: '100+' }]);
      };
      const handleRemoveStat = (idx: number) => {
        updateField('stats', statsList.filter((_: any, i: number) => i !== idx));
      };

      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-[#FFFF00]">
              Displayed Metrics ({statsList.length})
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddStat}
              className="h-7 text-xs border-white/20 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              Add Stat
            </Button>
          </div>

          <div className="space-y-2.5">
            {statsList.map((stat: any, i: number) => (
              <div
                key={i}
                className="p-3 rounded-2xl bg-[#08088F] border border-white/10 flex items-center gap-3 text-xs"
              >
                <div className="grid grid-cols-2 gap-3 flex-1">
                  <Input
                    value={stat.label || ''}
                    onChange={(e) => handleUpdateStat(i, 'label', e.target.value)}
                    placeholder="Stat Label (e.g. Verified Players)"
                    className="bg-[#0E0EB5] border-white/10 text-white rounded-lg text-xs"
                  />
                  <Input
                    value={stat.value || ''}
                    onChange={(e) => handleUpdateStat(i, 'value', e.target.value)}
                    placeholder="Stat Value (e.g. 500+)"
                    className="bg-[#0E0EB5] border-white/10 text-[#FFFF00] rounded-lg text-xs font-bold"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveStat(i)}
                  className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      );

    case 'footer':
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-[#D9DCFF]">Copyright Text</label>
            <Input
              value={content.copyright || ''}
              onChange={(e) => updateField('copyright', e.target.value)}
              placeholder="© 2026 eFootball Tournament Arena. All rights reserved."
              className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-[#5865F2]">Discord URL</label>
              <Input
                value={content.discord_url || ''}
                onChange={(e) => updateField('discord_url', e.target.value)}
                placeholder="https://discord.gg/..."
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-[#25D366]">WhatsApp URL</label>
              <Input
                value={content.whatsapp_url || ''}
                onChange={(e) => updateField('whatsapp_url', e.target.value)}
                placeholder="https://chat.whatsapp.com/..."
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-[#E1306C]">Instagram URL</label>
              <Input
                value={content.instagram_url || ''}
                onChange={(e) => updateField('instagram_url', e.target.value)}
                placeholder="https://instagram.com/..."
                className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-mono"
              />
            </div>
          </div>
        </div>
      );

    default:
      // Generic JSON field list editor
      return (
        <div className="space-y-3">
          <p className="text-xs text-[#D9DCFF]">
            Directly configure standard fields for <span className="text-[#FFFF00] font-bold">{sectionKey}</span>:
          </p>
          <div className="space-y-3">
            {Object.entries(content).map(([k, v]) => {
              if (typeof v === 'object' && v !== null) return null;
              return (
                <div key={k} className="space-y-1">
                  <label className="text-[10px] font-mono text-[#FFFF00] uppercase">{k}</label>
                  <Input
                    value={String(v ?? '')}
                    onChange={(e) => updateField(k, e.target.value)}
                    className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs"
                  />
                </div>
              );
            })}
          </div>
        </div>
      );
  }
}
