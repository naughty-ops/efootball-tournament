import { createClient } from '@/lib/supabase/client';
import type {
  HomepageSection,
  HomepageSectionKey,
  HomepageSectionStatus,
  HomepageAuditHistory,
  HomepageOverviewStats,
} from '@/types/database';

export interface UpdateSectionVisibilityInput {
  is_enabled?: boolean;
  is_visible_desktop?: boolean;
  is_visible_mobile?: boolean;
}

export interface ReorderSectionItem {
  id: string;
  display_order: number;
}

/**
 * Public function to fetch all published and enabled homepage sections.
 * Ordered by display_order ascending.
 */
export async function getPublicHomepageSections(): Promise<HomepageSection[]> {
  const supabase = createClient();
  const { data, error } = await (supabase.from('homepage_sections') as any)
    .select('*')
    .eq('is_enabled', true)
    .eq('status', 'published')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching public homepage sections:', error.message);
    return [];
  }

  return (data as HomepageSection[]) || [];
}

/**
 * Admin function to fetch all sections (draft, published, disabled).
 */
export async function getAdminHomepageSections(): Promise<HomepageSection[]> {
  const supabase = createClient();
  const { data, error } = await (supabase.from('homepage_sections') as any)
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching admin homepage sections:', error.message);
    throw new Error(error.message);
  }

  return (data as HomepageSection[]) || [];
}

/**
 * Admin function to compute CMS dashboard overview metrics.
 */
export async function getHomepageCmsStats(
  sections?: HomepageSection[]
): Promise<HomepageOverviewStats> {
  const allSections = sections || (await getAdminHomepageSections());

  const totalSections = allSections.length;
  const publishedCount = allSections.filter(
    (s) => s.status === 'published' && s.is_enabled
  ).length;
  const hiddenCount = allSections.filter((s) => !s.is_enabled).length;

  // Changes pending if draft_content is different from published_content or status is draft
  const draftChangesCount = allSections.filter((s) => {
    if (s.status === 'draft') return true;
    try {
      return (
        JSON.stringify(s.draft_content ?? {}) !==
        JSON.stringify(s.published_content ?? {})
      );
    } catch {
      return false;
    }
  }).length;

  let latestPublishedAt: string | null = null;
  allSections.forEach((s) => {
    if (s.last_published_at) {
      if (!latestPublishedAt || new Date(s.last_published_at) > new Date(latestPublishedAt)) {
        latestPublishedAt = s.last_published_at;
      }
    }
  });

  return {
    totalSections,
    publishedCount,
    hiddenCount,
    draftChangesCount,
    lastPublishedAt: latestPublishedAt,
  };
}

/**
 * Fetch recent audit history records.
 */
export async function getHomepageAuditHistory(
  limit: number = 20
): Promise<HomepageAuditHistory[]> {
  const supabase = createClient();
  const { data, error } = await (supabase.from('homepage_audit_history') as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching homepage audit history:', error.message);
    return [];
  }

  return (data as HomepageAuditHistory[]) || [];
}

/**
 * Helper to record audit log entry
 */
async function recordAuditEntry(
  sectionId: string,
  action: 'created' | 'draft_saved' | 'published' | 'visibility_toggled' | 'reordered' | 'reverted',
  changes: Record<string, any>,
  snapshot: Record<string, any>
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await (supabase.from('homepage_audit_history') as any).insert({
      section_id: sectionId,
      action,
      performed_by: user?.id ?? null,
      performed_by_email: user?.email ?? null,
      changes,
      snapshot,
    });
  } catch (err) {
    console.warn('Failed to record homepage audit entry:', err);
  }
}

/**
 * Admin action: update visibility settings for a section.
 */
export async function updateSectionVisibility(
  sectionId: string,
  updates: UpdateSectionVisibilityInput
): Promise<HomepageSection> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch current state for snapshot
  const { data: currentSection } = await (supabase.from('homepage_sections') as any)
    .select('*')
    .eq('id', sectionId)
    .single();

  const updatePayload = {
    ...updates,
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await (supabase.from('homepage_sections') as any)
    .update(updatePayload)
    .eq('id', sectionId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordAuditEntry(
    sectionId,
    'visibility_toggled',
    updates,
    (currentSection as unknown as Record<string, any>) || {}
  );

  return data as HomepageSection;
}

/**
 * Admin action: save draft content for a section.
 */
export async function saveSectionDraft(
  sectionId: string,
  draftContent: Record<string, any>,
  sectionName?: string,
  description?: string
): Promise<HomepageSection> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: currentSection } = await (supabase.from('homepage_sections') as any)
    .select('*')
    .eq('id', sectionId)
    .single();

  const updatePayload: Record<string, any> = {
    draft_content: draftContent,
    status: 'draft',
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  if (sectionName) updatePayload.section_name = sectionName;
  if (description !== undefined) updatePayload.description = description;

  const { data, error } = await (supabase.from('homepage_sections') as any)
    .update(updatePayload)
    .eq('id', sectionId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordAuditEntry(
    sectionId,
    'draft_saved',
    { draft_content: draftContent },
    (currentSection as unknown as Record<string, any>) || {}
  );

  return data as HomepageSection;
}

/**
 * Admin action: publish changes for a single section.
 * Promotes draft_content -> published_content.
 */
export async function publishSection(sectionId: string): Promise<HomepageSection> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: currentSection, error: fetchErr } = await (supabase.from('homepage_sections') as any)
    .select('*')
    .eq('id', sectionId)
    .single();

  if (fetchErr || !currentSection) {
    throw new Error(fetchErr?.message || 'Section not found');
  }

  const nowIso = new Date().toISOString();
  const updatePayload = {
    published_content: currentSection.draft_content,
    status: 'published' as HomepageSectionStatus,
    last_published_at: nowIso,
    published_by: user?.id ?? null,
    updated_by: user?.id ?? null,
    updated_at: nowIso,
  };

  const { data, error } = await (supabase.from('homepage_sections') as any)
    .update(updatePayload)
    .eq('id', sectionId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordAuditEntry(
    sectionId,
    'published',
    { published_content: currentSection.draft_content },
    (currentSection as unknown as Record<string, any>) || {}
  );

  return data as HomepageSection;
}

/**
 * Admin action: revert draft content back to published content.
 */
export async function revertSectionDraft(sectionId: string): Promise<HomepageSection> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: currentSection, error: fetchErr } = await (supabase.from('homepage_sections') as any)
    .select('*')
    .eq('id', sectionId)
    .single();

  if (fetchErr || !currentSection) {
    throw new Error(fetchErr?.message || 'Section not found');
  }

  const nowIso = new Date().toISOString();
  const updatePayload = {
    draft_content: currentSection.published_content,
    status: 'published' as HomepageSectionStatus,
    updated_by: user?.id ?? null,
    updated_at: nowIso,
  };

  const { data, error } = await (supabase.from('homepage_sections') as any)
    .update(updatePayload)
    .eq('id', sectionId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordAuditEntry(
    sectionId,
    'reverted',
    { draft_content: currentSection.published_content },
    (currentSection as unknown as Record<string, any>) || {}
  );

  return data as HomepageSection;
}

/**
 * Admin action: publish all sections that have pending draft changes.
 */
export async function publishAllPendingChanges(): Promise<HomepageSection[]> {
  const sections = await getAdminHomepageSections();

  const sectionsToPublish = sections.filter((s) => {
    if (s.status === 'draft') return true;
    try {
      return (
        JSON.stringify(s.draft_content ?? {}) !==
        JSON.stringify(s.published_content ?? {})
      );
    } catch {
      return false;
    }
  });

  const updatedSections: HomepageSection[] = [];
  for (const s of sectionsToPublish) {
    const published = await publishSection(s.id);
    updatedSections.push(published);
  }

  return updatedSections;
}

/**
 * Admin action: update display order of sections.
 */
export async function updateSectionsOrder(
  orderedItems: ReorderSectionItem[]
): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  for (const item of orderedItems) {
    await (supabase.from('homepage_sections') as any)
      .update({
        display_order: item.display_order,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);
  }

  if (orderedItems.length > 0) {
    await recordAuditEntry(
      orderedItems[0].id,
      'reordered',
      { reordered: orderedItems },
      {}
    );
  }
}
