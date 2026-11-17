'use client';

import React, { useState } from 'react';
import { X, Monitor, Smartphone, ExternalLink, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { HomepageSection } from '@/types/database';
import { HomepageVisualPreview } from './HomepageVisualPreview';

interface HomepageFullPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: HomepageSection[];
}

export function HomepageFullPreviewModal({
  isOpen,
  onClose,
  sections,
}: HomepageFullPreviewModalProps) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');

  if (!isOpen) return null;

  // Filter sections that are enabled and visible for the chosen viewport
  const visibleSections = sections.filter((s) => {
    if (!s.is_enabled) return false;
    if (viewport === 'desktop') return s.is_visible_desktop;
    if (viewport === 'mobile') return s.is_visible_mobile;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#08088F]/90 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-5xl h-[92vh] bg-[#0E0EB5] rounded-[32px] border border-white/20 shadow-2xl flex flex-col z-10 text-white overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 bg-[#1414B8] shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-[#FFFF00]/15 text-[#FFFF00] flex items-center justify-center font-black">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black uppercase font-display text-white">
                  Full Homepage Preview
                </h3>
                <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] font-black uppercase">
                  Draft Simulation
                </Badge>
              </div>
              <p className="text-xs text-[#D9DCFF] hidden sm:block">
                Shows all enabled sections with your latest draft changes applied.
              </p>
            </div>
          </div>

          {/* Viewport Switcher & Close */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#08088F] p-1 rounded-2xl border border-white/10">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setViewport('desktop')}
                className={`h-8 px-3 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all ${
                  viewport === 'desktop'
                    ? 'bg-[#FFFF00] text-[#08088F]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Monitor className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Desktop</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setViewport('mobile')}
                className={`h-8 px-3 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all ${
                  viewport === 'mobile'
                    ? 'bg-[#FFFF00] text-[#08088F]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mobile</span>
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-full"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Scrollable Preview Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#08088F]/50 flex justify-center">
          <div
            className={`w-full transition-all duration-300 space-y-6 ${
              viewport === 'mobile'
                ? 'max-w-md bg-[#0A0A7A] border-4 border-slate-700 rounded-[36px] p-4 shadow-2xl my-2'
                : 'max-w-4xl space-y-8'
            }`}
          >
            {visibleSections.length === 0 ? (
              <div className="py-20 text-center text-sm text-[#D9DCFF] font-medium">
                No sections are currently enabled for {viewport} viewport.
              </div>
            ) : (
              visibleSections.map((sec) => {
                const draftContent =
                  sec.draft_content && Object.keys(sec.draft_content).length > 0
                    ? sec.draft_content
                    : sec.published_content || {};

                return (
                  <div key={sec.id} className="relative group">
                    <div className="absolute -top-3 left-4 z-20">
                      <span className="bg-[#08088F] text-[#FFFF00] text-[9px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-white/20 shadow-md">
                        #{sec.display_order} • {sec.section_name}
                      </span>
                    </div>
                    <div className="pt-2">
                      <HomepageVisualPreview
                        sectionKey={sec.section_key}
                        content={draftContent}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
