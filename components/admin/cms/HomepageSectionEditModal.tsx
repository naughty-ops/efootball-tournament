'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, FileCode, Sparkles, UploadCloud, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { HomepageSection } from '@/types/database';

interface HomepageSectionEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: HomepageSection | null;
  onSaveDraft: (
    sectionId: string,
    draftContent: Record<string, any>,
    name?: string,
    description?: string
  ) => Promise<void>;
  onPublishNow: (sectionId: string) => Promise<void>;
}

export function HomepageSectionEditModal({
  isOpen,
  onClose,
  section,
  onSaveDraft,
  onPublishNow,
}: HomepageSectionEditModalProps) {
  const [sectionName, setSectionName] = useState('');
  const [description, setDescription] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'published_comparison'>('editor');

  useEffect(() => {
    if (section) {
      setSectionName(section.section_name);
      setDescription(section.description || '');
      setJsonText(JSON.stringify(section.draft_content || {}, null, 2));
      setJsonError(null);
      setActiveTab('editor');
    }
  }, [section]);

  if (!isOpen || !section) return null;

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setJsonText(val);
    try {
      JSON.parse(val);
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  const handleSave = async (publishImmediately: boolean = false) => {
    try {
      const parsedContent = JSON.parse(jsonText);
      if (publishImmediately) {
        setIsPublishing(true);
        await onSaveDraft(section.id, parsedContent, sectionName, description);
        await onPublishNow(section.id);
      } else {
        setIsSaving(true);
        await onSaveDraft(section.id, parsedContent, sectionName, description);
      }
      onClose();
    } catch (err: any) {
      setJsonError(`Invalid JSON format: ${err.message}`);
    } finally {
      setIsSaving(false);
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#08088F]/85 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-[#1414B8] rounded-[32px] border border-white/20 shadow-2xl p-6 sm:p-8 z-10 flex flex-col gap-5 animate-in zoom-in-95 duration-200 text-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-[#FFFF00]">
                {section.section_key}
              </span>
              <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] font-black uppercase">
                {section.status}
              </Badge>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase font-display tracking-tight">
              Edit Section Configuration
            </h2>
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

        {/* Tab switch */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('editor')}
            className={`rounded-full text-xs font-black uppercase tracking-wider px-4 py-1.5 transition-all ${
              activeTab === 'editor'
                ? 'bg-[#FFFF00] text-[#08088F]'
                : 'text-[#D9DCFF] hover:bg-white/10 hover:text-white'
            }`}
          >
            Draft Content Editor
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('published_comparison')}
            className={`rounded-full text-xs font-black uppercase tracking-wider px-4 py-1.5 transition-all ${
              activeTab === 'published_comparison'
                ? 'bg-[#FFFF00] text-[#08088F]'
                : 'text-[#D9DCFF] hover:bg-white/10 hover:text-white'
            }`}
          >
            View Live vs Draft Diff
          </Button>
        </div>

        {/* Form Body */}
        <div className="overflow-y-auto space-y-4 pr-1 flex-1">
          {activeTab === 'editor' ? (
            <>
              {/* Name & Description Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-[#D9DCFF]">
                    Display Name
                  </label>
                  <Input
                    value={sectionName}
                    onChange={(e) => setSectionName(e.target.value)}
                    className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-[#D9DCFF]">
                    Description
                  </label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-[#0E0EB5] border-white/15 text-white rounded-xl text-xs font-bold"
                  />
                </div>
              </div>

              {/* JSON Editor Header */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-[#FFFF00]" />
                  <span className="text-xs font-black uppercase tracking-wider text-white">
                    Section Content (JSON Schema)
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleFormatJson}
                  className="text-xs text-[#FFFF00] hover:text-white hover:bg-white/10 gap-1 rounded-full py-1 h-auto"
                >
                  <Sparkles className="h-3 w-3" />
                  Format JSON
                </Button>
              </div>

              {/* JSON Textarea */}
              <div className="relative">
                <textarea
                  value={jsonText}
                  onChange={handleJsonChange}
                  rows={14}
                  className="w-full rounded-2xl bg-[#08088F] border border-white/20 p-4 font-mono text-xs text-[#FFFF00] focus:outline-hidden focus:border-[#FFFF00] transition-colors resize-y leading-relaxed"
                  spellCheck={false}
                />
              </div>

              {/* Error feedback */}
              {jsonError && (
                <div className="rounded-xl bg-[#FF168B]/15 border border-[#FF168B]/40 p-3 flex items-center gap-2.5 text-xs text-[#FF85C0]">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="font-mono">{jsonError}</span>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                    Live Published Content
                  </span>
                  <span className="text-[10px] text-[#A6ACFF]">
                    {section.last_published_at
                      ? new Date(section.last_published_at).toLocaleString()
                      : 'Never published'}
                  </span>
                </div>
                <pre className="p-3.5 rounded-2xl bg-[#08088F] border border-white/15 text-[11px] font-mono text-[#D9DCFF] overflow-x-auto max-h-96">
                  {JSON.stringify(section.published_content, null, 2)}
                </pre>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-[#FFFF00]">
                    Current Working Draft
                  </span>
                  <span className="text-[10px] text-[#A6ACFF]">
                    {new Date(section.updated_at).toLocaleString()}
                  </span>
                </div>
                <pre className="p-3.5 rounded-2xl bg-[#08088F] border border-[#FFFF00]/30 text-[11px] font-mono text-[#FFFF00] overflow-x-auto max-h-96">
                  {jsonText}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="text-xs font-black uppercase text-[#D9DCFF] hover:text-white rounded-full"
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSave(false)}
              disabled={Boolean(jsonError) || isSaving || isPublishing}
              className="rounded-full border-white/20 bg-white/10 hover:bg-white/20 text-white font-black text-xs uppercase px-5 flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? 'Saving Draft...' : 'Save Draft'}</span>
            </Button>

            <Button
              type="button"
              onClick={() => handleSave(true)}
              disabled={Boolean(jsonError) || isSaving || isPublishing}
              className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase px-5 flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-all"
            >
              <UploadCloud className="h-4 w-4" />
              <span>{isPublishing ? 'Publishing...' : 'Publish Live Now'}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
