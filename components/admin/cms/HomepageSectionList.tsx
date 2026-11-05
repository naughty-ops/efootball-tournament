'use client';

import React from 'react';
import {
  ArrowUp,
  ArrowDown,
  Monitor,
  Smartphone,
  Edit2,
  UploadCloud,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { HomepageSection } from '@/types/database';

interface HomepageSectionListProps {
  sections: HomepageSection[];
  onToggleVisibility: (
    sectionId: string,
    updates: {
      is_enabled?: boolean;
      is_visible_desktop?: boolean;
      is_visible_mobile?: boolean;
    }
  ) => Promise<void>;
  onMoveOrder: (index: number, direction: 'up' | 'down') => Promise<void>;
  onEditSection: (section: HomepageSection) => void;
  onPublishSection: (sectionId: string) => Promise<void>;
  onRevertSection: (sectionId: string) => Promise<void>;
  actionLoadingId: string | null;
}

export function HomepageSectionList({
  sections,
  onToggleVisibility,
  onMoveOrder,
  onEditSection,
  onPublishSection,
  onRevertSection,
  actionLoadingId,
}: HomepageSectionListProps) {
  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-lg sm:text-xl font-black text-white uppercase font-display tracking-tight flex items-center gap-2">
          <span>Sections Architecture</span>
          <span className="text-xs font-black text-[#FFFF00] bg-white/10 px-2.5 py-0.5 rounded-full">
            {sections.length} Managed
          </span>
        </h2>
        <span className="text-xs text-[#A6ACFF] font-medium hidden sm:inline">
          Use arrows to rearrange section order on public homepage
        </span>
      </div>

      <div className="space-y-3">
        {sections.map((section, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === sections.length - 1;
          const isLoading = actionLoadingId === section.id;

          const hasDraftChanges =
            section.status === 'draft' ||
            JSON.stringify(section.draft_content ?? {}) !==
              JSON.stringify(section.published_content ?? {});

          return (
            <div
              key={section.id}
              className={`rounded-2xl sm:rounded-3xl border transition-all p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg ${
                !section.is_enabled
                  ? 'border-white/10 bg-[#0C0C85]/70 opacity-75'
                  : hasDraftChanges
                  ? 'border-[#FFFF00]/40 bg-[#1414B8] shadow-[0_0_20px_rgba(255,255,0,0.1)]'
                  : 'border-white/15 bg-[#1414B8]'
              }`}
            >
              {/* Left Column: Order Controls & Section Info */}
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                {/* Reorder Buttons */}
                <div className="flex flex-col gap-1 shrink-0 pt-0.5 sm:pt-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isFirst || isLoading}
                    onClick={() => onMoveOrder(idx, 'up')}
                    className="h-7 w-7 rounded-lg text-white hover:bg-white/15 hover:text-[#FFFF00] disabled:opacity-20"
                    title="Move Section Up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isLast || isLoading}
                    onClick={() => onMoveOrder(idx, 'down')}
                    className="h-7 w-7 rounded-lg text-white hover:bg-white/15 hover:text-[#FFFF00] disabled:opacity-20"
                    title="Move Section Down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Index Pill */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#08088F] text-[#FFFF00] border border-white/10 font-black text-sm font-display shadow-inner">
                  #{section.display_order}
                </div>

                {/* Section Titles */}
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] text-[#FFFF00] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10">
                      {section.section_key}
                    </span>

                    {/* Status Badge */}
                    {!section.is_enabled ? (
                      <Badge className="bg-slate-700 text-slate-300 text-[10px] font-black uppercase">
                        Disabled
                      </Badge>
                    ) : hasDraftChanges ? (
                      <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] font-black uppercase flex items-center gap-1 shadow-sm">
                        <AlertCircle className="h-3 w-3" />
                        Draft Modified
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Live Published
                      </Badge>
                    )}
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-white uppercase font-display truncate">
                    {section.section_name}
                  </h3>

                  {section.description && (
                    <p className="text-xs text-[#D9DCFF] font-medium line-clamp-1 max-w-xl">
                      {section.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Right Column: Visibility Toggles & Action Controls */}
              <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/10">
                {/* Viewport & Enable Controls */}
                <div className="flex items-center gap-1.5 bg-[#08088F] p-1.5 rounded-2xl border border-white/10">
                  {/* Master Toggle */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isLoading}
                    onClick={() =>
                      onToggleVisibility(section.id, {
                        is_enabled: !section.is_enabled,
                      })
                    }
                    className={`h-8 px-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                      section.is_enabled
                        ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                        : 'bg-white/10 text-slate-400 hover:text-white'
                    }`}
                    title={section.is_enabled ? 'Section Enabled' : 'Section Disabled'}
                  >
                    {section.is_enabled ? (
                      <>
                        <Eye className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Active</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Hidden</span>
                      </>
                    )}
                  </Button>

                  {/* Desktop Toggle */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isLoading || !section.is_enabled}
                    onClick={() =>
                      onToggleVisibility(section.id, {
                        is_visible_desktop: !section.is_visible_desktop,
                      })
                    }
                    className={`h-8 w-8 rounded-xl transition-all ${
                      section.is_visible_desktop
                        ? 'text-[#FFFF00] bg-white/15'
                        : 'text-white/30 hover:text-white'
                    }`}
                    title={
                      section.is_visible_desktop
                        ? 'Visible on Desktop'
                        : 'Hidden on Desktop'
                    }
                  >
                    <Monitor className="h-3.5 w-3.5" />
                  </Button>

                  {/* Mobile Toggle */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isLoading || !section.is_enabled}
                    onClick={() =>
                      onToggleVisibility(section.id, {
                        is_visible_mobile: !section.is_visible_mobile,
                      })
                    }
                    className={`h-8 w-8 rounded-xl transition-all ${
                      section.is_visible_mobile
                        ? 'text-[#FFFF00] bg-white/15'
                        : 'text-white/30 hover:text-white'
                    }`}
                    title={
                      section.is_visible_mobile
                        ? 'Visible on Mobile'
                        : 'Hidden on Mobile'
                    }
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Edit & Action Buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isLoading}
                    onClick={() => onEditSection(section)}
                    className="h-8 rounded-xl border-white/20 bg-white/5 hover:bg-white/15 text-white font-black text-xs uppercase px-3 flex items-center gap-1.5"
                  >
                    <Edit2 className="h-3.5 w-3.5 text-[#FFFF00]" />
                    <span>Edit</span>
                  </Button>

                  {hasDraftChanges && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isLoading}
                        onClick={() => onRevertSection(section.id)}
                        className="h-8 w-8 rounded-xl text-white/70 hover:text-white hover:bg-white/10"
                        title="Revert Draft to Published"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        disabled={isLoading}
                        onClick={() => onPublishSection(section.id)}
                        className="h-8 rounded-xl bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase px-3 flex items-center gap-1.5 shadow-md active:scale-95"
                      >
                        <UploadCloud className="h-3.5 w-3.5" />
                        <span>Publish</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
