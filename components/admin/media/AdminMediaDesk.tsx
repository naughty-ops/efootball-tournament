'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  HardDrive,
  ImageIcon,
  UploadCloud,
  Trash2,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Eye,
  Copy,
  Check,
  AlertTriangle,
  Filter,
  RefreshCw,
  Search,
  FileImage,
  Layers,
  X,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MediaUploadZone from '@/components/media/MediaUploadZone';
import { deleteMediaAction, getPrivateEvidenceUrlAction } from '@/app/actions/mediaActions';
import type { MediaAsset, MediaEntityType, MediaStatus } from '@/types/database';

interface AdminMediaDeskProps {
  initialAssets: MediaAsset[];
  totalCount: number;
  totalMB: number;
  countByCategory: Record<string, number>;
  bytesByCategory: Record<string, number>;
  selectedCategory?: string;
  selectedStatus?: string;
}

const CATEGORY_TABS: { label: string; value: MediaEntityType | 'all' }[] = [
  { label: 'All Assets', value: 'all' },
  { label: 'Avatars', value: 'player_avatar' },
  { label: 'Banners', value: 'tournament_banner' },
  { label: 'Thumbnails', value: 'tournament_thumbnail' },
  { label: 'Match Evidence', value: 'match_evidence' },
  { label: 'Dispute Proof', value: 'dispute_evidence' },
  { label: 'Admin Media', value: 'admin_media' },
];

export default function AdminMediaDesk({
  initialAssets,
  totalCount,
  totalMB,
  countByCategory,
  bytesByCategory,
  selectedCategory = 'all',
  selectedStatus = 'all',
}: AdminMediaDeskProps) {
  const router = useRouter();
  const [currentCategory, setCurrentCategory] = useState<string>(selectedCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedUploadCategory, setSelectedUploadCategory] = useState<MediaEntityType>('admin_media');

  // Preview modal state
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [loadingSignedUrl, setLoadingSignedUrl] = useState(false);

  // Delete modal state
  const [assetToDelete, setAssetToDelete] = useState<MediaAsset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Copied state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenPreview = async (asset: MediaAsset) => {
    setPreviewAsset(asset);
    if (asset.visibility === 'private') {
      setLoadingSignedUrl(true);
      const res = await getPrivateEvidenceUrlAction(asset.cloudinary_public_id);
      setLoadingSignedUrl(false);
      if (res.success && res.data) {
        setPreviewSignedUrl(res.data);
      } else {
        setPreviewSignedUrl(asset.secure_url);
      }
    } else {
      setPreviewSignedUrl(asset.secure_url);
    }
  };

  const handleConfirmDelete = async () => {
    if (!assetToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    const res = await deleteMediaAction(assetToDelete.cloudinary_public_id);
    setIsDeleting(false);

    if (!res.success) {
      setDeleteError(res.error || 'Failed to delete asset.');
      return;
    }

    setAssetToDelete(null);
    router.refresh();
  };

  // Filter assets locally based on category and search query
  const filteredAssets = initialAssets.filter((asset) => {
    if (currentCategory !== 'all' && asset.entity_type !== currentCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        asset.cloudinary_public_id.toLowerCase().includes(q) ||
        (asset.entity_id && asset.entity_id.toLowerCase().includes(q)) ||
        (asset.format && asset.format.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Top Heading & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wider text-white flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-[#FFFF00]" />
            <span>Media Management Desk</span>
          </h1>
          <p className="text-xs text-white/60 mt-1">
            Centralized Cloudinary asset storage, delivery optimization, and dispute evidence protection.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => router.refresh()}
            variant="outline"
            size="sm"
            className="border-white/20 bg-[#0A0A7A] hover:bg-[#1010C5] text-white text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            onClick={() => setIsUploadModalOpen(true)}
            size="sm"
            className="bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] font-bold text-xs"
          >
            <UploadCloud className="h-4 w-4 mr-1.5" />
            Upload Asset
          </Button>
        </div>
      </div>

      {/* Storage Metrics KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/20">
          <div className="flex items-center justify-between text-white/60 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Stored</span>
            <HardDrive className="h-4 w-4 text-[#FFFF00]" />
          </div>
          <div className="text-2xl font-black text-white">{totalMB} MB</div>
          <div className="text-[10px] text-white/50 mt-1">{totalCount} total active files</div>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/20">
          <div className="flex items-center justify-between text-white/60 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Player Avatars</span>
            <FileImage className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">{countByCategory['player_avatar'] || 0}</div>
          <div className="text-[10px] text-white/50 mt-1">
            {formatBytes(bytesByCategory['player_avatar'] || 0)} used
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/20">
          <div className="flex items-center justify-between text-white/60 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Tournaments</span>
            <Layers className="h-4 w-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {(countByCategory['tournament_banner'] || 0) + (countByCategory['tournament_thumbnail'] || 0)}
          </div>
          <div className="text-[10px] text-white/50 mt-1">
            {formatBytes(
              (bytesByCategory['tournament_banner'] || 0) + (bytesByCategory['tournament_thumbnail'] || 0)
            )}{' '}
            used
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/20">
          <div className="flex items-center justify-between text-white/60 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Disputes & Matches</span>
            <Lock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {(countByCategory['match_evidence'] || 0) + (countByCategory['dispute_evidence'] || 0)}
          </div>
          <div className="text-[10px] text-amber-300 font-semibold mt-1">Private signed vaults</div>
        </Card>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORY_TABS.map((tab) => {
              const isActive = currentCategory === tab.value;
              const count =
                tab.value === 'all'
                  ? totalCount
                  : countByCategory[tab.value] || 0;
              return (
                <button
                  key={tab.value}
                  onClick={() => setCurrentCategory(tab.value)}
                  className={`text-xs px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all border ${
                    isActive
                      ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00] shadow-sm'
                      : 'bg-[#0A0A7A] hover:bg-[#1010C5] text-white/80 border-white/10'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-[#08088F]/20 text-[#08088F]' : 'bg-white/10 text-white/70'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search public ID, entity..."
              className="bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 text-xs pl-8 h-9 rounded-xl"
            />
          </div>
        </div>
      </div>

      {/* Assets Grid */}
      {filteredAssets.length === 0 ? (
        <Card className="p-12 text-center rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-3">
          <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/40">
            <ImageIcon className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No media assets found</h3>
          <p className="text-xs text-white/50 max-w-sm mx-auto">
            {searchQuery
              ? 'No assets match your search query. Try clearing the search filter.'
              : 'No assets have been uploaded for this category yet.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAssets.map((asset) => {
            const isPrivate = asset.visibility === 'private';
            const isProtectedEvidence =
              asset.entity_type === 'match_evidence' || asset.entity_type === 'dispute_evidence';

            return (
              <Card
                key={asset.id}
                className="overflow-hidden rounded-2xl bg-[#0A0A7A] border border-white/15 flex flex-col justify-between hover:border-white/30 transition-all shadow-md group"
              >
                {/* Image Thumbnail Area */}
                <div
                  className="relative w-full aspect-video bg-[#050550] overflow-hidden cursor-pointer"
                  onClick={() => handleOpenPreview(asset)}
                >
                  <Image
                    src={asset.secure_url}
                    alt={asset.cloudinary_public_id}
                    fill
                    sizes="(max-width: 640px) 100vw, 300px"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />

                  {/* Badges on Top */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-black/70 backdrop-blur-xs text-white border border-white/20">
                      {asset.entity_type.replace('_', ' ')}
                    </span>
                    {isPrivate ? (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/80 text-black flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Private
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/80 text-white">
                        Public
                      </span>
                    )}
                  </div>

                  <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white/90">
                    {asset.width}x{asset.height}
                  </span>
                </div>

                {/* Card Info Details */}
                <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-white/50">
                      <span className="uppercase font-mono text-[10px]">{asset.format}</span>
                      <span>{formatBytes(asset.file_size || 0)}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <p
                        className="text-xs font-mono text-white/90 truncate max-w-[190px]"
                        title={asset.cloudinary_public_id}
                      >
                        {asset.cloudinary_public_id.split('/').pop()}
                      </p>
                      <button
                        onClick={() => handleCopy(asset.cloudinary_public_id, asset.id)}
                        className="p-1 rounded text-white/40 hover:text-white transition-colors"
                        title="Copy Public ID"
                      >
                        {copiedId === asset.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {asset.entity_id && (
                      <p className="text-[10px] text-white/40 font-mono truncate">
                        ID: {asset.entity_id}
                      </p>
                    )}
                  </div>

                  {/* Actions Toolbar */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                    <Button
                      onClick={() => handleOpenPreview(asset)}
                      variant="ghost"
                      size="sm"
                      className="text-xs text-white/80 hover:text-white hover:bg-white/10 h-8 px-2 flex-1 justify-center"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Preview
                    </Button>

                    <Button
                      onClick={() => setAssetToDelete(asset)}
                      variant="ghost"
                      size="sm"
                      className={`text-xs h-8 px-2 ${
                        isProtectedEvidence
                          ? 'text-white/30 cursor-not-allowed hover:bg-transparent'
                          : 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10'
                      }`}
                      title={
                        isProtectedEvidence
                          ? 'Protected match evidence cannot be deleted to preserve audit integrity'
                          : 'Delete asset from Cloudinary & Database'
                      }
                      disabled={isProtectedEvidence}
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

      {/* Asset Preview Modal */}
      {previewAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl rounded-3xl bg-[#0B0B7A] border border-white/20 p-6 shadow-2xl space-y-4">
            <button
              onClick={() => {
                setPreviewAsset(null);
                setPreviewSignedUrl(null);
              }}
              className="absolute right-4 top-4 p-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-[#FFFF00] text-[#08088F]">
                {previewAsset.entity_type}
              </span>
              <span className="text-xs font-mono text-white/60 truncate max-w-sm">
                {previewAsset.cloudinary_public_id}
              </span>
            </div>

            {/* Media Image Frame */}
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/60 border border-white/10 flex items-center justify-center">
              {loadingSignedUrl ? (
                <div className="flex flex-col items-center gap-2 text-white/60 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-[#FFFF00]" />
                  <span>Generating authenticated signed URL...</span>
                </div>
              ) : previewSignedUrl ? (
                <Image
                  src={previewSignedUrl}
                  alt={previewAsset.cloudinary_public_id}
                  fill
                  className="object-contain"
                />
              ) : null}
            </div>

            {/* Image Specs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-[#0A0A7A] p-3 rounded-xl border border-white/10 font-mono">
              <div>
                <span className="text-white/40 block text-[10px]">Dimensions</span>
                <span className="text-white font-bold">
                  {previewAsset.width} x {previewAsset.height} px
                </span>
              </div>
              <div>
                <span className="text-white/40 block text-[10px]">File Size</span>
                <span className="text-white font-bold">{formatBytes(previewAsset.file_size || 0)}</span>
              </div>
              <div>
                <span className="text-white/40 block text-[10px]">Format</span>
                <span className="text-white font-bold uppercase">{previewAsset.format}</span>
              </div>
              <div>
                <span className="text-white/40 block text-[10px]">Visibility</span>
                <span className="text-white font-bold capitalize">{previewAsset.visibility}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {previewSignedUrl && (
                <Button
                  onClick={() => window.open(previewSignedUrl, '_blank')}
                  variant="outline"
                  size="sm"
                  className="border-white/20 bg-[#0A0A7A] text-white hover:bg-white/10 text-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Open Full Resolution
                </Button>
              )}
              <Button
                onClick={() => {
                  setPreviewAsset(null);
                  setPreviewSignedUrl(null);
                }}
                size="sm"
                className="bg-[#FFFF00] text-[#08088F] font-bold text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {assetToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl bg-[#0B0B7A] border border-rose-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Media Asset</h3>
                <p className="text-xs text-white/50">This action permanently deletes the file from Cloudinary.</p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-[#0A0A7A] border border-white/10 space-y-1 font-mono text-xs">
              <p className="text-white/60 text-[10px]">Cloudinary Public ID:</p>
              <p className="text-white truncate font-bold">{assetToDelete.cloudinary_public_id}</p>
            </div>

            <p className="text-xs text-white/70">
              Any tournament banners or player avatars referencing this asset will revert to default platform assets.
            </p>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssetToDelete(null)}
                disabled={isDeleting}
                className="flex-1 border-white/20 bg-[#0A0A7A] text-white hover:bg-white/10 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
              >
                {isDeleting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" /> Deleting...
                  </span>
                ) : (
                  'Permanently Delete'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl bg-[#0B0B7A] border border-white/20 p-6 shadow-2xl space-y-5">
            <button
              onClick={() => setIsUploadModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-black uppercase tracking-wider text-white flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-[#FFFF00]" />
                <span>Upload Media Asset</span>
              </h3>
              <p className="text-xs text-white/60 mt-0.5">
                Upload images directly to Cloudinary storage with automated format optimization and thumbnail delivery.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-white mb-1.5 uppercase tracking-wider">
                Asset Category
              </label>
              <select
                value={selectedUploadCategory}
                onChange={(e) => setSelectedUploadCategory(e.target.value as MediaEntityType)}
                className="w-full rounded-xl bg-[#0A0A7A] border border-white/20 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FFFF00]"
              >
                <option value="admin_media">Admin Media / Promotion</option>
                <option value="tournament_banner">Tournament Banner</option>
                <option value="tournament_thumbnail">Tournament Thumbnail</option>
              </select>
            </div>

            <MediaUploadZone
              category={selectedUploadCategory}
              onUploadSuccess={() => {
                setIsUploadModalOpen(false);
                router.refresh();
              }}
              label="Select or Drop Asset"
              helperText="Upload JPEG, PNG, or WebP image up to 5MB."
              aspectRatio="banner"
            />
          </div>
        </div>
      )}
    </div>
  );
}
