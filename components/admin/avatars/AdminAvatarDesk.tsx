'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  Search,
  Users,
  Layers,
  AlertTriangle,
  Loader2,
  X,
  UploadCloud,
  Check,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MediaUploadZone from '@/components/media/MediaUploadZone';
import {
  adminCreateAvatarAction,
  adminUpdateAvatarAction,
  adminToggleAvatarStatusAction,
  adminDeleteAvatarAction,
} from '@/app/actions/avatarActions';
import type { Avatar } from '@/types/database';

interface AdminAvatarItem extends Avatar {
  usageCount: number;
}

interface AdminAvatarDeskProps {
  initialAvatars: AdminAvatarItem[];
}

const PRESET_CATEGORIES = ['General', 'Legends', 'Strikers', 'Tacticians', 'Midfield', 'Defense', 'Special'];

export default function AdminAvatarDesk({ initialAvatars }: AdminAvatarDeskProps) {
  const router = useRouter();
  const [avatars, setAvatars] = useState<AdminAvatarItem[]>(initialAvatars);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCategory, setCreateCategory] = useState('General');
  const [createCustomCategory, setCreateCustomCategory] = useState('');
  const [createOrder, setCreateOrder] = useState<number>(0);
  const [createIsActive, setCreateIsActive] = useState(true);
  const [createImageUrl, setCreateImageUrl] = useState('');
  const [createPublicId, setCreatePublicId] = useState<string | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Modal State
  const [editingAvatar, setEditingAvatar] = useState<AdminAvatarItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editOrder, setEditOrder] = useState(0);
  const [editIsActive, setEditIsActive] = useState(true);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Modal State
  const [deletingAvatar, setDeletingAvatar] = useState<AdminAvatarItem | null>(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Toggling status state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Preview full image state
  const [previewAvatar, setPreviewAvatar] = useState<AdminAvatarItem | null>(null);

  // Filter Categories
  const allCategories = [
    'all',
    ...Array.from(new Set(avatars.map((a) => a.category).filter(Boolean))),
  ];

  // Filtered List
  const filteredAvatars = avatars.filter((a) => {
    if (selectedCategory !== 'all' && a.category !== selectedCategory) {
      return false;
    }
    if (statusFilter === 'active' && !a.is_active) {
      return false;
    }
    if (statusFilter === 'inactive' && a.is_active) {
      return false;
    }
    if (searchQuery.trim()) {
      return a.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const totalActive = avatars.filter((a) => a.is_active).length;
  const totalInactive = avatars.length - totalActive;
  const totalPlayersUsing = avatars.reduce((sum, a) => sum + (a.usageCount || 0), 0);

  // Handle Toggle Active
  const handleToggleActive = async (avatar: AdminAvatarItem) => {
    setTogglingId(avatar.id);
    const newStatus = !avatar.is_active;

    const res = await adminToggleAvatarStatusAction(avatar.id, newStatus);
    setTogglingId(null);

    if (res.success) {
      setAvatars((prev) =>
        prev.map((a) => (a.id === avatar.id ? { ...a, is_active: newStatus } : a))
      );
      router.refresh();
    }
  };

  // Handle Create Avatar
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) {
      setCreateError('Avatar name is required.');
      return;
    }
    if (!createImageUrl.trim()) {
      setCreateError('Please upload an avatar image or enter an image URL.');
      return;
    }

    setIsSubmittingCreate(true);
    setCreateError(null);

    const finalCategory =
      createCategory === 'Other' && createCustomCategory.trim()
        ? createCustomCategory.trim()
        : createCategory;

    const formData = new FormData();
    formData.append('name', createName.trim());
    formData.append('category', finalCategory);
    formData.append('displayOrder', createOrder.toString());
    formData.append('isActive', createIsActive ? 'true' : 'false');
    formData.append('imageUrl', createImageUrl.trim());
    if (createPublicId) {
      formData.append('cloudinaryPublicId', createPublicId);
    }

    const res = await adminCreateAvatarAction(formData);
    setIsSubmittingCreate(false);

    if (!res.success) {
      setCreateError(res.error || 'Failed to create avatar.');
      return;
    }

    setIsCreateOpen(false);
    resetCreateForm();
    router.refresh();
  };

  const resetCreateForm = () => {
    setCreateName('');
    setCreateCategory('General');
    setCreateCustomCategory('');
    setCreateOrder(0);
    setCreateIsActive(true);
    setCreateImageUrl('');
    setCreatePublicId(null);
    setCreateError(null);
  };

  // Handle Edit Submit
  const handleEditOpen = (avatar: AdminAvatarItem) => {
    setEditingAvatar(avatar);
    setEditName(avatar.name);
    setEditCategory(avatar.category);
    setEditOrder(avatar.display_order);
    setEditIsActive(avatar.is_active);
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAvatar) return;
    if (!editName.trim()) {
      setEditError('Avatar name is required.');
      return;
    }

    setIsSubmittingEdit(true);
    setEditError(null);

    const res = await adminUpdateAvatarAction(editingAvatar.id, {
      name: editName.trim(),
      category: editCategory.trim(),
      displayOrder: editOrder,
      isActive: editIsActive,
    });

    setIsSubmittingEdit(false);

    if (!res.success) {
      setEditError(res.error || 'Failed to update avatar.');
      return;
    }

    setEditingAvatar(null);
    router.refresh();
  };

  // Handle Safe Delete
  const handleDeleteSubmit = async () => {
    if (!deletingAvatar) return;

    setIsSubmittingDelete(true);
    setDeleteError(null);

    const res = await adminDeleteAvatarAction(deletingAvatar.id);
    setIsSubmittingDelete(false);

    if (!res.success) {
      setDeleteError(res.error || 'Failed to delete avatar.');
      return;
    }

    setDeletingAvatar(null);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wider text-white flex items-center gap-2 font-display">
            <Sparkles className="h-6 w-6 text-[#FFFF00]" />
            <span>Avatar Library Management</span>
          </h1>
          <p className="text-xs text-white/60 mt-1">
            Curate official competitor avatars, upload via Cloudinary, and manage player availability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => router.refresh()}
            variant="outline"
            size="sm"
            className="border-white/20 bg-[#0A0A7A] hover:bg-[#1010C5] text-white text-xs h-10 px-4 rounded-xl cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>

          <Button
            onClick={() => {
              resetCreateForm();
              setIsCreateOpen(true);
            }}
            size="sm"
            className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider h-10 px-5 rounded-xl shadow-lg cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-1.5 stroke-[3]" />
            Add Avatar
          </Button>
        </div>
      </div>

      {/* KPI Storage & Usage Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/20">
          <div className="flex items-center justify-between text-white/60 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Library</span>
            <Layers className="h-4 w-4 text-[#FFFF00]" />
          </div>
          <div className="text-2xl font-black text-white">{avatars.length}</div>
          <div className="text-[10px] text-white/50 mt-1">Curated avatars</div>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/20">
          <div className="flex items-center justify-between text-white/60 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Available</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">{totalActive}</div>
          <div className="text-[10px] text-white/50 mt-1">Selectable by players</div>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/20">
          <div className="flex items-center justify-between text-white/60 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Inactive / Hidden</span>
            <XCircle className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400">{totalInactive}</div>
          <div className="text-[10px] text-white/50 mt-1">Staged or retired</div>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/20">
          <div className="flex items-center justify-between text-white/60 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Players Assigned</span>
            <Users className="h-4 w-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black text-white">{totalPlayersUsing}</div>
          <div className="text-[10px] text-white/50 mt-1">Active profile links</div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Categories */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {allCategories.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-xs px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all border capitalize cursor-pointer ${
                    isActive
                      ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00] shadow-sm'
                      : 'bg-[#0A0A7A] hover:bg-[#1010C5] text-white/80 border-white/10'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Search & Status Filters */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search avatar name..."
                className="bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 text-xs pl-8 h-9 rounded-xl focus:border-[#FFFF00]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-[#0A0A7A] border border-white/20 text-white text-xs h-9 px-2.5 rounded-xl focus:outline-none focus:border-[#FFFF00]"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Avatars Grid */}
      {filteredAvatars.length === 0 ? (
        <Card className="p-12 text-center rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-3">
          <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/40">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No avatars found</h3>
          <p className="text-xs text-white/50 max-w-sm mx-auto">
            {searchQuery
              ? 'No avatars match your search query.'
              : 'The avatar library is empty. Click "Add Avatar" above to create one.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredAvatars.map((avatar) => {
            const isToggling = togglingId === avatar.id;

            return (
              <Card
                key={avatar.id}
                className="overflow-hidden rounded-2xl bg-[#0A0A7A] border border-white/15 flex flex-col justify-between hover:border-white/30 transition-all shadow-md group"
              >
                {/* Top Image Frame */}
                <div className="relative w-full aspect-square bg-[#050550] flex items-center justify-center p-6 overflow-hidden">
                  <div
                    onClick={() => setPreviewAvatar(avatar)}
                    className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-2 border-white/20 group-hover:scale-105 group-hover:border-[#FFFF00] transition-all cursor-pointer shadow-lg"
                  >
                    <Image
                      src={avatar.image_url}
                      alt={avatar.name}
                      fill
                      sizes="150px"
                      className="object-cover"
                    />
                  </div>

                  {/* Badges on Top */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-black/70 backdrop-blur-xs text-white border border-white/20">
                      {avatar.category}
                    </span>
                  </div>

                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#08088F]/80 text-[#FFFF00] border border-[#FFFF00]/30">
                    Order: {avatar.display_order}
                  </span>
                </div>

                {/* Info & Toolbar */}
                <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-white truncate font-display" title={avatar.name}>
                        {avatar.name}
                      </h3>
                      <button
                        onClick={() => handleToggleActive(avatar)}
                        disabled={isToggling}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-all cursor-pointer ${
                          avatar.is_active
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                            : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30 hover:bg-zinc-500/30'
                        }`}
                        title="Click to toggle active status"
                      >
                        {isToggling ? '...' : avatar.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-white/50 pt-1">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-sky-400" />
                        <span>{avatar.usageCount} player{avatar.usageCount !== 1 ? 's' : ''}</span>
                      </span>
                      {avatar.cloudinary_public_id && (
                        <span className="font-mono text-[9px] text-[#FFFF00]/70 truncate max-w-[100px]">
                          Cloudinary
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-1.5">
                    <Button
                      onClick={() => setPreviewAvatar(avatar)}
                      variant="ghost"
                      size="sm"
                      className="text-xs text-white/70 hover:text-white hover:bg-white/10 h-8 px-2 flex-1 justify-center"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      View
                    </Button>

                    <Button
                      onClick={() => handleEditOpen(avatar)}
                      variant="ghost"
                      size="sm"
                      className="text-xs text-[#FFFF00] hover:text-[#FFFF00] hover:bg-[#FFFF00]/10 h-8 px-2 flex-1 justify-center"
                    >
                      <Edit2 className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </Button>

                    <Button
                      onClick={() => {
                        setDeletingAvatar(avatar);
                        setDeleteError(null);
                      }}
                      variant="ghost"
                      size="sm"
                      className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 h-8 px-2"
                      title="Delete avatar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* CREATE AVATAR MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl bg-[#0B0B7A] border border-white/20 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsCreateOpen(false)}
              disabled={isSubmittingCreate}
              className="absolute right-4 top-4 p-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-black uppercase tracking-wider text-white flex items-center gap-2 font-display">
                <Plus className="w-5 h-5 text-[#FFFF00]" />
                <span>Add Official Avatar</span>
              </h3>
              <p className="text-xs text-white/60 mt-0.5">
                Upload image to Cloudinary or provide a URL to add to the official player selection library.
              </p>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wider">
                  Avatar Name *
                </label>
                <Input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Golden Champion, Apex Striker"
                  className="bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 text-xs rounded-xl h-10"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    value={createCategory}
                    onChange={(e) => setCreateCategory(e.target.value)}
                    className="w-full rounded-xl bg-[#0A0A7A] border border-white/20 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FFFF00]"
                  >
                    {PRESET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="Other">Custom Category...</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wider">
                    Display Order
                  </label>
                  <Input
                    type="number"
                    value={createOrder}
                    onChange={(e) => setCreateOrder(parseInt(e.target.value) || 0)}
                    className="bg-[#0A0A7A] border-white/20 text-white text-xs rounded-xl h-10"
                  />
                </div>
              </div>

              {createCategory === 'Other' && (
                <div>
                  <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wider">
                    Custom Category Name
                  </label>
                  <Input
                    value={createCustomCategory}
                    onChange={(e) => setCreateCustomCategory(e.target.value)}
                    placeholder="Enter custom category"
                    className="bg-[#0A0A7A] border-white/20 text-white text-xs rounded-xl h-10"
                  />
                </div>
              )}

              {/* Cloudinary Image Upload Section */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-bold text-white uppercase tracking-wider">
                  Avatar Image (Cloudinary Upload)
                </label>
                <MediaUploadZone
                  category="admin_media"
                  initialUrl={createImageUrl}
                  aspectRatio="square"
                  onUploadSuccess={(url, publicId) => {
                    setCreateImageUrl(url);
                    setCreatePublicId(publicId);
                  }}
                  onRemove={() => {
                    setCreateImageUrl('');
                    setCreatePublicId(null);
                  }}
                  label="Upload Avatar to Cloudinary"
                  helperText="JPEG, PNG, or WebP. Max 2MB. Square image recommended."
                />
              </div>

              {/* Or Direct Image URL fallback */}
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">
                  Or Image Asset URL / Path:
                </label>
                <Input
                  value={createImageUrl}
                  onChange={(e) => setCreateImageUrl(e.target.value)}
                  placeholder="/avatars/legend-gold.svg or https://..."
                  className="bg-[#0A0A7A] border-white/20 text-white text-xs rounded-xl h-9"
                />
              </div>

              {/* Live Preview Before Publishing */}
              {createImageUrl && (
                <div className="p-3 rounded-2xl bg-[#0A0A7A] border border-white/20 flex items-center gap-3">
                  <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-[#FFFF00] bg-black/40 shrink-0">
                    <Image
                      src={createImageUrl}
                      alt="Avatar preview"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-white/50 uppercase tracking-wider block font-bold">
                      Live Preview
                    </span>
                    <span className="text-xs font-bold text-white">
                      {createName || 'Avatar Name'}
                    </span>
                    <span className="text-[10px] text-[#FFFF00] block">
                      Category: {createCategory}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="createIsActive"
                  checked={createIsActive}
                  onChange={(e) => setCreateIsActive(e.target.checked)}
                  className="rounded border-white/30 text-[#FFFF00] focus:ring-0 cursor-pointer"
                />
                <label htmlFor="createIsActive" className="text-xs text-white/90 font-bold cursor-pointer">
                  Publish immediately (Active for players)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isSubmittingCreate}
                  className="border-white/20 bg-[#0A0A7A] text-white hover:bg-white/10 text-xs rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-xl px-5"
                >
                  {isSubmittingCreate ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Publishing...
                    </span>
                  ) : (
                    'Publish Avatar'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT AVATAR MODAL */}
      {editingAvatar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl bg-[#0B0B7A] border border-white/20 p-6 shadow-2xl space-y-4">
            <button
              onClick={() => setEditingAvatar(null)}
              disabled={isSubmittingEdit}
              className="absolute right-4 top-4 p-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-[#FFFF00] bg-black/40 shrink-0">
                <Image
                  src={editingAvatar.image_url}
                  alt={editingAvatar.name}
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Edit Avatar Details</h3>
                <p className="text-xs text-white/50">{editingAvatar.name}</p>
              </div>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wider">
                  Avatar Name
                </label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-[#0A0A7A] border-white/20 text-white text-xs rounded-xl h-10"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wider">
                    Category
                  </label>
                  <Input
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="bg-[#0A0A7A] border-white/20 text-white text-xs rounded-xl h-10"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wider">
                    Display Order
                  </label>
                  <Input
                    type="number"
                    value={editOrder}
                    onChange={(e) => setEditOrder(parseInt(e.target.value) || 0)}
                    className="bg-[#0A0A7A] border-white/20 text-white text-xs rounded-xl h-10"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="rounded border-white/30 text-[#FFFF00] focus:ring-0 cursor-pointer"
                />
                <label htmlFor="editIsActive" className="text-xs text-white/90 font-bold cursor-pointer">
                  Active (available in player selector)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingAvatar(null)}
                  disabled={isSubmittingEdit}
                  className="border-white/20 bg-[#0A0A7A] text-white hover:bg-white/10 text-xs rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-xl px-5"
                >
                  {isSubmittingEdit ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION SAFEGUARD MODAL */}
      {deletingAvatar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl bg-[#0B0B7A] border border-rose-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Avatar Safeguard</h3>
                <p className="text-xs text-white/50">{deletingAvatar.name}</p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/10 flex items-center gap-3">
              <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-white/20 bg-black/40 shrink-0">
                <Image
                  src={deletingAvatar.image_url}
                  alt={deletingAvatar.name}
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">{deletingAvatar.name}</span>
                <span className="text-[11px] text-sky-400 font-semibold block">
                  {deletingAvatar.usageCount} player{deletingAvatar.usageCount !== 1 ? 's' : ''} currently using this avatar
                </span>
              </div>
            </div>

            <p className="text-xs text-white/70 leading-relaxed">
              {deletingAvatar.usageCount > 0 ? (
                <>
                  <strong className="text-[#FFFF00]">Safeguard Active:</strong> Deleting this avatar will automatically reassign the{' '}
                  <span className="text-white font-bold">{deletingAvatar.usageCount} player(s)</span> to the platform default competitor avatar. No profile will have broken images.
                </>
              ) : (
                'Are you sure you want to permanently remove this avatar from the library?'
              )}
            </p>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingAvatar(null)}
                disabled={isSubmittingDelete}
                className="flex-1 border-white/20 bg-[#0A0A7A] text-white hover:bg-white/10 text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDeleteSubmit}
                disabled={isSubmittingDelete}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl"
              >
                {isSubmittingDelete ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting...
                  </span>
                ) : (
                  'Confirm Delete'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* FULL RESOLUTION PREVIEW MODAL */}
      {previewAvatar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-3xl bg-[#0B0B7A] border border-white/20 p-6 shadow-2xl space-y-4 text-center">
            <button
              onClick={() => setPreviewAvatar(null)}
              className="absolute right-4 top-4 p-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative w-40 h-40 rounded-full overflow-hidden border-4 border-[#FFFF00] bg-black/40 mx-auto shadow-[0_0_25px_rgba(255,255,0,0.3)]">
              <Image
                src={previewAvatar.image_url}
                alt={previewAvatar.name}
                fill
                className="object-cover"
              />
            </div>

            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-wider font-display">
                {previewAvatar.name}
              </h3>
              <p className="text-xs text-[#FFFF00] font-bold capitalize mt-0.5">
                Category: {previewAvatar.category}
              </p>
              <p className="text-[11px] text-white/50 mt-1">
                Display Order: {previewAvatar.display_order} • Status: {previewAvatar.is_active ? 'Active' : 'Inactive'}
              </p>
              <p className="text-[11px] text-sky-400 mt-1 font-semibold">
                {previewAvatar.usageCount} active player{previewAvatar.usageCount !== 1 ? 's' : ''}
              </p>
            </div>

            <Button
              onClick={() => setPreviewAvatar(null)}
              className="w-full bg-[#FFFF00] text-[#08088F] font-bold text-xs rounded-xl h-10"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
