'use client';

import React, { useState, useEffect } from 'react';
import { X, AlertCircle, FileCode, Sparkles, UploadCloud, Save, Eye, SlidersHorizontal, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { HomepageSection } from '@/types/database';
import { HomepageVisualForms } from './HomepageVisualForms';
import { HomepageVisualPreview } from './HomepageVisualPreview';

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
  const [contentObj, setContentObj] = useState<Record<string, any>>({});
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [activeTab, setActiveTab] = useState<'visual_form' | 'preview' | 'json_editor' | 'diff'>('visual_form');

  useEffect(() => {
    if (section) {
      setSectionName(section.section_name);
      setDescription(section.description || '');
      const initialContent = section.draft_content && Object.keys(section.draft_content).length > 0
        ? section.draft_content
        : section.published_content || {};
      setContentObj(initialContent);
      setJsonText(JSON.stringify(initialContent, null, 2));
      setJsonError(null);
      setActiveTab('visual_form');
    }
  }, [section]);

  if (!isOpen || !section) return null;

  // When Visual Form updates content object
  const handleVisualChange = (updated: Record<string, any>) => {
    setContentObj(updated);
    setJsonText(JSON.stringify(updated, null, 2));
    setJsonError(null);
  };

  // When Raw JSON textarea updates
  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setJsonText(val);
    try {
      const parsed = JSON.parse(val);
      setContentObj(parsed);
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setContentObj(parsed);
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  const handleSave = async (publishImmediately: boolean = false) => {
    try {
      let finalContent = contentObj;
      if (activeTab === 'json_editor') {
        finalContent = JSON.parse(jsonText);
      }
      if (publishImmediately) {
        setIsPublishing(true);
        await onSaveDraft(section.id, finalContent, sectionName, description);
        await onPublishNow(section.id);
      } else {
        setIsSaving(true);
        await onSaveDraft(section.id, finalContent, sectionName, description);
      }
      onClose();
    } catch (err: any) {
      setJsonError(`Failed to save: ${err.message}`);
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
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-[#1414B8] rounded-[32px] border border-white/20 shadow-2xl p-6 sm:p-8 z-10 flex flex-col gap-5 animate-in zoom-in-95 duration-200 text-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/10 text-[#FFFF00]">
                {section.section_key}
              </span>
              <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] font-black uppercase">
                {section.status}
              </Badge>
              <span className="text-[10px] text-[#A6ACFF] font-medium">
                Order #{section.display_order}
              </span>
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

        {/* Global Metadata: Section Name & Description */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-[#0A0A7A] p-3.5 rounded-2xl border border-white/10 shrink-0">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-[#D9DCFF]">
              Section Title (Admin Dashboard)
            </label>
            <Input
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs font-bold"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-[#D9DCFF]">
              Internal Notes / Description
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-[#08088F] border-white/15 text-white rounded-xl text-xs"
            />
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 border-b border-white/10 pb-2.5 shrink-0 overflow-x-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('visual_form')}
            className={`rounded-full text-xs font-black uppercase tracking-wider px-4 py-1.5 flex items-center gap-1.5 transition-all ${
              activeTab === 'visual_form'
                ? 'bg-[#FFFF00] text-[#08088F] shadow-md'
                : 'text-[#D9DCFF] hover:bg-white/10 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Visual Form</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('preview')}
            className={`rounded-full text-xs font-black uppercase tracking-wider px-4 py-1.5 flex items-center gap-1.5 transition-all ${
              activeTab === 'preview'
                ? 'bg-[#FFFF00] text-[#08088F] shadow-md'
                : 'text-[#D9DCFF] hover:bg-white/10 hover:text-white'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Live Preview</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('json_editor')}
            className={`rounded-full text-xs font-black uppercase tracking-wider px-4 py-1.5 flex items-center gap-1.5 transition-all ${
              activeTab === 'json_editor'
                ? 'bg-[#FFFF00] text-[#08088F] shadow-md'
                : 'text-[#D9DCFF] hover:bg-white/10 hover:text-white'
            }`}
          >
            <FileCode className="h-3.5 w-3.5" />
            <span>Raw JSON Schema</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('diff')}
            className={`rounded-full text-xs font-black uppercase tracking-wider px-4 py-1.5 flex items-center gap-1.5 transition-all ${
              activeTab === 'diff'
                ? 'bg-[#FFFF00] text-[#08088F] shadow-md'
                : 'text-[#D9DCFF] hover:bg-white/10 hover:text-white'
            }`}
          >
            <GitCompare className="h-3.5 w-3.5" />
            <span>Live vs Draft Diff</span>
          </Button>
        </div>

        {/* Tab Content Body */}
        <div className="overflow-y-auto space-y-4 pr-1 flex-1">
          {activeTab === 'visual_form' && (
            <HomepageVisualForms
              sectionKey={section.section_key}
              content={contentObj}
              onChange={handleVisualChange}
            />
          )}

          {activeTab === 'preview' && (
            <div className="space-y-4 py-2">
              <HomepageVisualPreview
                sectionKey={section.section_key}
                content={contentObj}
              />
            </div>
          )}

          {activeTab === 'json_editor' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-[#FFFF00] flex items-center gap-1.5">
                  <FileCode className="h-4 w-4" />
                  JSON Content Schema
                </span>
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

              <textarea
                value={jsonText}
                onChange={handleJsonChange}
                rows={13}
                className="w-full rounded-2xl bg-[#08088F] border border-white/20 p-4 font-mono text-xs text-[#FFFF00] focus:outline-hidden focus:border-[#FFFF00] transition-colors resize-y leading-relaxed"
                spellCheck={false}
              />

              {jsonError && (
                <div className="rounded-xl bg-[#FF168B]/15 border border-[#FF168B]/40 p-3 flex items-center gap-2.5 text-xs text-[#FF85C0]">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="font-mono">{jsonError}</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'diff' && (
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
                  {JSON.stringify(contentObj, null, 2)}
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
