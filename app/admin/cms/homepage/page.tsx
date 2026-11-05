'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  getAdminHomepageSections,
  getHomepageCmsStats,
  getHomepageAuditHistory,
  updateSectionVisibility,
  updateSectionsOrder,
  saveSectionDraft,
  publishSection,
  publishAllPendingChanges,
  revertSectionDraft,
} from '@/services/homepageCmsService';
import type {
  HomepageSection,
  HomepageOverviewStats,
  HomepageAuditHistory,
} from '@/types/database';
import { HomepageCmsHeader } from '@/components/admin/cms/HomepageCmsHeader';
import { HomepageOverviewCards } from '@/components/admin/cms/HomepageOverviewCards';
import { HomepageSectionList } from '@/components/admin/cms/HomepageSectionList';
import { HomepageSectionEditModal } from '@/components/admin/cms/HomepageSectionEditModal';
import { HomepageAuditHistoryModal } from '@/components/admin/cms/HomepageAuditHistoryModal';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function AdminHomepageCmsPage() {
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [stats, setStats] = useState<HomepageOverviewStats>({
    totalSections: 0,
    publishedCount: 0,
    hiddenCount: 0,
    draftChangesCount: 0,
    lastPublishedAt: null,
  });
  const [auditHistory, setAuditHistory] = useState<HomepageAuditHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isPublishingAll, setIsPublishingAll] = useState(false);
  const [editingSection, setEditingSection] = useState<HomepageSection | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  };

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getAdminHomepageSections();
      setSections(data);
      const computedStats = await getHomepageCmsStats(data);
      setStats(computedStats);
    } catch (err: any) {
      console.error('Failed to load homepage CMS data:', err);
      showNotification('error', `Failed to load CMS data: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadAuditHistory = async () => {
    try {
      setAuditLoading(true);
      const history = await getHomepageAuditHistory(30);
      setAuditHistory(history);
    } catch (err: any) {
      console.error('Failed to load audit history:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleOpenAuditHistory = () => {
    setIsAuditModalOpen(true);
    void loadAuditHistory();
  };

  const handleToggleVisibility = async (
    sectionId: string,
    updates: {
      is_enabled?: boolean;
      is_visible_desktop?: boolean;
      is_visible_mobile?: boolean;
    }
  ) => {
    try {
      setActionLoadingId(sectionId);
      const updated = await updateSectionVisibility(sectionId, updates);
      setSections((prev) => prev.map((s) => (s.id === sectionId ? updated : s)));
      const updatedSections = sections.map((s) => (s.id === sectionId ? updated : s));
      const computedStats = await getHomepageCmsStats(updatedSections);
      setStats(computedStats);
      showNotification('success', 'Section visibility settings updated');
    } catch (err: any) {
      console.error('Error toggling visibility:', err);
      showNotification('error', `Failed to update visibility: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const newSections = [...sections];
    const [moved] = newSections.splice(index, 1);
    newSections.splice(targetIndex, 0, moved);

    // Re-index display_order
    const reorderedItems = newSections.map((sec, idx) => ({
      ...sec,
      display_order: idx + 1,
    }));

    setSections(reorderedItems);

    try {
      setActionLoadingId(moved.id);
      await updateSectionsOrder(
        reorderedItems.map((s) => ({ id: s.id, display_order: s.display_order }))
      );
      showNotification('success', 'Sections display order updated');
    } catch (err: any) {
      console.error('Failed to update sections order:', err);
      showNotification('error', `Failed to reorder sections: ${err.message}`);
      await loadData();
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSaveDraft = async (
    sectionId: string,
    draftContent: Record<string, any>,
    name?: string,
    description?: string
  ) => {
    try {
      const updated = await saveSectionDraft(sectionId, draftContent, name, description);
      setSections((prev) => prev.map((s) => (s.id === sectionId ? updated : s)));
      const updatedSections = sections.map((s) => (s.id === sectionId ? updated : s));
      const computedStats = await getHomepageCmsStats(updatedSections);
      setStats(computedStats);
      showNotification('success', 'Draft content saved successfully');
    } catch (err: any) {
      console.error('Failed to save draft:', err);
      showNotification('error', `Failed to save draft: ${err.message}`);
      throw err;
    }
  };

  const handlePublishSection = async (sectionId: string) => {
    try {
      setActionLoadingId(sectionId);
      const updated = await publishSection(sectionId);
      setSections((prev) => prev.map((s) => (s.id === sectionId ? updated : s)));
      const updatedSections = sections.map((s) => (s.id === sectionId ? updated : s));
      const computedStats = await getHomepageCmsStats(updatedSections);
      setStats(computedStats);
      showNotification('success', `Published live: ${updated.section_name}`);
    } catch (err: any) {
      console.error('Failed to publish section:', err);
      showNotification('error', `Failed to publish section: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePublishAll = async () => {
    try {
      setIsPublishingAll(true);
      await publishAllPendingChanges();
      await loadData();
      showNotification('success', 'All pending section drafts published live successfully');
    } catch (err: any) {
      console.error('Failed to publish all changes:', err);
      showNotification('error', `Failed to publish all changes: ${err.message}`);
    } finally {
      setIsPublishingAll(false);
    }
  };

  const handleRevertSection = async (sectionId: string) => {
    try {
      setActionLoadingId(sectionId);
      const updated = await revertSectionDraft(sectionId);
      setSections((prev) => prev.map((s) => (s.id === sectionId ? updated : s)));
      const updatedSections = sections.map((s) => (s.id === sectionId ? updated : s));
      const computedStats = await getHomepageCmsStats(updatedSections);
      setStats(computedStats);
      showNotification('success', `Reverted draft changes for ${updated.section_name}`);
    } catch (err: any) {
      console.error('Failed to revert draft:', err);
      showNotification('error', `Failed to revert draft: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-16">
      {/* Toast / Notification Banner */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 max-w-md p-4 rounded-2xl border shadow-2xl flex items-center gap-3 text-xs font-bold animate-in slide-in-from-top-4 duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/90 border-red-500/40 text-red-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          )}
          <span className="flex-1">{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <HomepageCmsHeader
        pendingDraftCount={stats.draftChangesCount}
        onPublishAll={handlePublishAll}
        onOpenAuditHistory={handleOpenAuditHistory}
        isPublishing={isPublishingAll}
      />

      {/* Overview KPI Cards */}
      <HomepageOverviewCards stats={stats} />

      {/* Main Section Architecture List */}
      {isLoading ? (
        <div className="py-20 text-center space-y-3">
          <div className="h-10 w-10 border-2 border-[#FFFF00] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-[#D9DCFF] font-medium">Loading CMS configuration...</p>
        </div>
      ) : (
        <HomepageSectionList
          sections={sections}
          onToggleVisibility={handleToggleVisibility}
          onMoveOrder={handleMoveOrder}
          onEditSection={(sec) => setEditingSection(sec)}
          onPublishSection={handlePublishSection}
          onRevertSection={handleRevertSection}
          actionLoadingId={actionLoadingId}
        />
      )}

      {/* Edit Section Modal */}
      <HomepageSectionEditModal
        isOpen={Boolean(editingSection)}
        onClose={() => setEditingSection(null)}
        section={editingSection}
        onSaveDraft={handleSaveDraft}
        onPublishNow={handlePublishSection}
      />

      {/* Audit History Modal */}
      <HomepageAuditHistoryModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        history={auditHistory}
        isLoading={auditLoading}
      />
    </div>
  );
}
