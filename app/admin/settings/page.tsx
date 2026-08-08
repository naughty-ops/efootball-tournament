'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Settings, Plus, Trash2, Edit3, Save, RotateCcw, Check, Sparkles, Image as ImageIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CarouselSlide } from '@/components/public/ImageCarousel';
import { getHomeBanners, saveHomeBanners, resetHomeBanners, fetchHomeBannersFromDB } from '@/services/bannerService';

const SAMPLE_BANNERS = [
  '/images/banner1.jpg',
  '/images/banner2.jpg',
  '/images/banner3.jpg',
];

export default function AdminSettingsPage() {
  const [slides, setSlides] = useState<CarouselSlide[]>(getHomeBanners);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CarouselSlide>>({});
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [newSlideModalOpen, setNewSlideModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const dbBanners = await fetchHomeBannersFromDB();
      if (!cancelled) setSlides(dbBanners);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveAll = async (updatedSlides: CarouselSlide[]) => {
    setSlides(updatedSlides);
    await saveHomeBanners(updatedSlides);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleStartEdit = (slide: CarouselSlide) => {
    setEditingId(slide.id);
    setEditForm({ ...slide });
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    const updated = slides.map((s) => {
      if (s.id === editingId) {
        return {
          ...s,
          ...editForm,
          title: editForm.title || s.title,
          image: editForm.image || s.image,
        } as CarouselSlide;
      }
      return s;
    });
    handleSaveAll(updated);
    setEditingId(null);
    setEditForm({});
  };

  const handleDeleteSlide = (id: string) => {
    if (slides.length <= 1) {
      alert('You must keep at least one active slide for the home carousel.');
      return;
    }
    const updated = slides.filter((s) => s.id !== id);
    handleSaveAll(updated);
  };

  const handleAddSlide = () => {
    const newSlide: CarouselSlide = {
      id: `slide-${Date.now()}`,
      image: editForm.image || '/images/banner1.jpg',
      title: editForm.title || 'New Tournament Showcase',
      subtitle: editForm.subtitle || 'Join the tournament competition and track live scores.',
      badgeText: editForm.badgeText || 'Featured Event',
      actionText: editForm.actionText || 'View Tournament',
      actionHref: editForm.actionHref || '/tournaments',
    };
    const updated = [...slides, newSlide];
    handleSaveAll(updated);
    setNewSlideModalOpen(false);
    setEditForm({});
  };

  const handleReset = async () => {
    if (confirm('Reset home banners to default eFootball theme slides?')) {
      const def = await resetHomeBanners();
      setSlides(def);
      setEditingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B3323] tracking-tight flex items-center gap-2">
            <Settings className="h-7 w-7 text-primary" />
            <span>Admin Settings & Banner Management</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Customize user home page carousel banners, titles, buttons, and system preferences.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 text-xs">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Defaults
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditForm({
                title: '',
                subtitle: '',
                badgeText: 'Live Tournament',
                image: '/images/banner1.jpg',
                actionText: 'Explore Now',
                actionHref: '/tournaments',
              });
              setNewSlideModalOpen(true);
            }}
            className="gap-1.5 text-xs font-bold bg-[#00C853] hover:bg-[#00E676] text-[#0B3323]"
          >
            <Plus className="h-4 w-4" />
            Add New Banner
          </Button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {savedSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Home Dashboard Carousel Banners updated successfully! Public users will immediately see your changes.</span>
        </div>
      )}

      {/* Home Carousel Banners List */}
      <Card className="border-border shadow-xs">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-extrabold text-[#0B3323] flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-primary" />
                User Home Dashboard Carousel Banners ({slides.length})
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Banners displayed on the public home page (`/`). Edit image links, text, and action buttons.
              </CardDescription>
            </div>
            <Badge variant="efootball" className="font-bold text-[10px]">
              LIVE ON HOME DASHBOARD
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-6">
          {slides.map((slide, index) => {
            const isEditing = editingId === slide.id;
            return (
              <div
                key={slide.id}
                className="rounded-2xl border border-border bg-white overflow-hidden shadow-xs hover:border-primary/40 transition-all space-y-0"
              >
                {/* Banner Header Info */}
                <div className="p-4 bg-[#F4F8F5] border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary text-white font-extrabold text-xs">
                      {index + 1}
                    </span>
                    <div>
                      <h4 className="text-sm font-extrabold text-[#0B3323]">{slide.title}</h4>
                      <p className="text-[11px] text-muted-foreground truncate max-w-md">
                        {slide.image}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <Button
                          size="sm"
                          onClick={handleSaveEdit}
                          className="h-8 gap-1 text-xs font-bold bg-[#00C853] text-[#0B3323] hover:bg-[#00E676]"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Save Slide
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingId(null)}
                          className="h-8 text-xs"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStartEdit(slide)}
                          className="h-8 gap-1 text-xs font-semibold"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit Slide
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteSlide(slide.id)}
                          className="h-8 w-8 p-0 border-destructive/40 text-destructive hover:bg-destructive/10"
                          title="Delete Slide"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Banner Content & Preview */}
                <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Left Col: Live Slide Preview */}
                  <div className="relative w-full aspect-[16/9] min-h-[140px] max-h-[220px] rounded-xl overflow-hidden border border-border bg-slate-900 shadow-inner group">
                    <Image
                      src={isEditing ? (editForm.image || slide.image) : slide.image}
                      alt={slide.title}
                      fill
                      className="object-cover object-center"
                      unoptimized={(isEditing ? editForm.image : slide.image)?.startsWith('http')}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B3323] via-[#0B3323]/50 to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3 text-white">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-500 text-[9px] font-bold uppercase mb-1">
                        {isEditing ? editForm.badgeText : slide.badgeText}
                      </span>
                      <h5 className="text-xs font-extrabold truncate">
                        {isEditing ? editForm.title : slide.title}
                      </h5>
                    </div>
                  </div>

                  {/* Right Col: Fields */}
                  <div className="md:col-span-2 space-y-3">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div>
                          <label className="text-[11px] font-bold text-[#0B3323] block mb-1">
                            Banner Image URL *
                          </label>
                          <div className="flex gap-2">
                            <Input
                              value={editForm.image || ''}
                              onChange={(e) => setEditForm({ ...editForm, image: e.target.value })}
                              placeholder="https://domain.com/image.jpg"
                              className="text-xs h-8"
                            />
                          </div>
                          {/* Sample preset buttons */}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-[10px] text-muted-foreground font-semibold">Presets:</span>
                            {SAMPLE_BANNERS.map((preset, pIdx) => (
                              <button
                                type="button"
                                key={preset}
                                onClick={() => setEditForm({ ...editForm, image: preset })}
                                className="text-[10px] px-2 py-0.5 rounded bg-secondary hover:bg-primary/20 text-[#0B3323] font-semibold border border-border"
                              >
                                Banner {pIdx + 1}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-[#0B3323] block mb-1">
                              Banner Title *
                            </label>
                            <Input
                              value={editForm.title || ''}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                              placeholder="e.g. Champions League Kickoff"
                              className="text-xs h-8"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[#0B3323] block mb-1">
                              Badge Tag Text
                            </label>
                            <Input
                              value={editForm.badgeText || ''}
                              onChange={(e) => setEditForm({ ...editForm, badgeText: e.target.value })}
                              placeholder="e.g. Live Championship"
                              className="text-xs h-8"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[#0B3323] block mb-1">
                            Subtitle / Description
                          </label>
                          <Input
                            value={editForm.subtitle || ''}
                            onChange={(e) => setEditForm({ ...editForm, subtitle: e.target.value })}
                            placeholder="Brief catchy description of the tournament..."
                            className="text-xs h-8"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-[#0B3323] block mb-1">
                              Action Button Text
                            </label>
                            <Input
                              value={editForm.actionText || ''}
                              onChange={(e) => setEditForm({ ...editForm, actionText: e.target.value })}
                              placeholder="e.g. View Brackets"
                              className="text-xs h-8"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[#0B3323] block mb-1">
                              Action Button Target Link
                            </label>
                            <Input
                              value={editForm.actionHref || ''}
                              onChange={(e) => setEditForm({ ...editForm, actionHref: e.target.value })}
                              placeholder="/tournaments or /live"
                              className="text-xs h-8"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between pb-1 border-b border-border/50">
                          <span className="text-muted-foreground font-medium">Badge Tag:</span>
                          <Badge variant="efootball" className="text-[10px] font-bold">
                            {slide.badgeText || 'Featured'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between pb-1 border-b border-border/50">
                          <span className="text-muted-foreground font-medium">Subtitle:</span>
                          <span className="font-medium text-[#0B3323] truncate max-w-xs">{slide.subtitle}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground font-medium">Button Link:</span>
                          <span className="font-mono text-[11px] text-primary">{slide.actionText} → {slide.actionHref}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Add New Slide Modal / Dialog */}
      {newSlideModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-border shadow-2xl max-w-xl w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-extrabold text-[#0B3323] flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Add New Home Banner Slide
              </h3>
              <button
                type="button"
                onClick={() => setNewSlideModalOpen(false)}
                className="text-muted-foreground hover:text-foreground font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-1">
                  Banner Image URL *
                </label>
                <Input
                  value={editForm.image || ''}
                  onChange={(e) => setEditForm({ ...editForm, image: e.target.value })}
                  placeholder="https://domain.com/banner.jpg"
                  className="text-xs"
                />
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] text-muted-foreground font-semibold">Presets:</span>
                  {SAMPLE_BANNERS.map((preset, pIdx) => (
                    <button
                      type="button"
                      key={preset}
                      onClick={() => setEditForm({ ...editForm, image: preset })}
                      className="text-[10px] px-2 py-0.5 rounded bg-secondary hover:bg-primary/20 text-[#0B3323] font-semibold border border-border"
                    >
                      Banner {pIdx + 1}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-1">
                  Banner Title *
                </label>
                <Input
                  value={editForm.title || ''}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="e.g. World eFootball Masters 2026"
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#0B3323] block mb-1">
                    Badge Tag
                  </label>
                  <Input
                    value={editForm.badgeText || ''}
                    onChange={(e) => setEditForm({ ...editForm, badgeText: e.target.value })}
                    placeholder="e.g. Live Cup"
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B3323] block mb-1">
                    Action Link
                  </label>
                  <Input
                    value={editForm.actionHref || ''}
                    onChange={(e) => setEditForm({ ...editForm, actionHref: e.target.value })}
                    placeholder="/tournaments"
                    className="text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-1">
                  Subtitle / Description
                </label>
                <Input
                  value={editForm.subtitle || ''}
                  onChange={(e) => setEditForm({ ...editForm, subtitle: e.target.value })}
                  placeholder="Catchy tagline or announcement..."
                  className="text-xs"
                />
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNewSlideModalOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddSlide}
                disabled={!editForm.title}
                className="rounded-xl text-xs font-bold bg-[#00C853] text-[#0B3323] hover:bg-[#00E676]"
              >
                Add Slide
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
