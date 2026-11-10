'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import {
  UploadCloud,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileImage,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { uploadMediaAction } from '@/app/actions/mediaActions';
import type { MediaEntityType } from '@/types/database';
import { MEDIA_SIZE_LIMITS } from '@/lib/media/validation';
import { compressScreenshotForEvidence } from '@/lib/media/clientCompression';

interface MediaUploadZoneProps {
  category: MediaEntityType;
  entityId?: string;
  initialUrl?: string | null;
  onUploadSuccess: (url: string, publicId: string) => void;
  onRemove?: () => void;
  label?: string;
  helperText?: string;
  className?: string;
  aspectRatio?: 'square' | 'banner' | 'video';
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function MediaUploadZone({
  category,
  entityId,
  initialUrl,
  onUploadSuccess,
  onRemove,
  label,
  helperText,
  className,
  aspectRatio = 'banner',
}: MediaUploadZoneProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl || null);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [compressionInfo, setCompressionInfo] = useState<{
    originalKB: number;
    compressedKB: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isScreenshotEvidence = category === 'match_evidence' || category === 'dispute_evidence';
  const maxSize = isScreenshotEvidence ? 2 * 1024 * 1024 : (MEDIA_SIZE_LIMITS[category] || 2 * 1024 * 1024);
  const maxSizeMB = Math.round(maxSize / (1024 * 1024));

  const handleFile = async (file: File) => {
    setError(null);
    setCompressionInfo(null);
    setStatusMessage(null);

    // 1. Strict 2 MB rejection rule for screenshot evidence
    if (isScreenshotEvidence && file.size > 2 * 1024 * 1024) {
      setError('File size exceeds the 2 MB limit. Please select a smaller screenshot.');
      return;
    }

    // Client-side MIME validation
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Invalid format. Only JPEG, PNG, and WebP images are allowed.');
      return;
    }

    // Client-side Size validation for other categories
    if (!isScreenshotEvidence && file.size > maxSize) {
      setError(`File is too large. Maximum size for this image is ${maxSizeMB} MB.`);
      return;
    }

    let fileToUpload = file;

    // 2. Automated Compression handling for screenshot evidence
    if (isScreenshotEvidence) {
      try {
        setIsUploading(true);
        setStatusMessage('Compressing screenshot for score readability...');
        const compResult = await compressScreenshotForEvidence(file, 500 * 1024);
        fileToUpload = compResult.file;

        if (fileToUpload.size > 500 * 1024) {
          throw new Error(
            'Unable to compress screenshot below 500 KB while preserving score readability. Please upload another screenshot.'
          );
        }

        setCompressionInfo({
          originalKB: Math.round(compResult.originalSize / 1024),
          compressedKB: Math.round(compResult.compressedSize / 1024),
        });
      } catch (compErr: any) {
        console.error('Compression error:', compErr);
        setIsUploading(false);
        setStatusMessage(null);
        setError(
          compErr.message ||
            'Unable to compress screenshot below 500 KB while preserving score readability. Please upload another screenshot.'
        );
        return;
      }
    }

    // Generate local preview immediately
    const objectUrl = URL.createObjectURL(fileToUpload);
    setPreviewUrl(objectUrl);
    setIsUploading(true);
    setStatusMessage('Uploading compressed screenshot to Cloudinary...');

    try {
      const formData = new FormData();
      formData.append('file', fileToUpload);
      formData.append('category', category);
      if (entityId) formData.append('entityId', entityId);

      const res = await uploadMediaAction(formData);

      if (!res.success || !res.data) {
        throw new Error(res.error || 'Upload failed.');
      }

      setPreviewUrl(res.data.secure_url);
      onUploadSuccess(res.data.secure_url, res.data.cloudinary_public_id);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload image to Cloudinary.');
      setPreviewUrl(initialUrl || null);
      setCompressionInfo(null);
    } finally {
      setIsUploading(false);
      setStatusMessage(null);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onRemove?.();
  };

  const ratioClass =
    aspectRatio === 'square'
      ? 'aspect-square max-w-[200px]'
      : aspectRatio === 'banner'
      ? 'aspect-[21/9] min-h-[140px]'
      : 'aspect-video';

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <label className="block text-xs font-bold text-white uppercase tracking-wider">
          {label}
        </label>
      )}

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <div
        onClick={() => !isUploading && fileInputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'relative w-full rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden flex flex-col items-center justify-center text-center p-4',
          ratioClass,
          isDragging
            ? 'border-[#FFFF00] bg-[#FFFF00]/10 scale-[1.01]'
            : previewUrl
            ? 'border-white/20 bg-[#0A0A7A]'
            : 'border-white/20 bg-[#0A0A7A] hover:border-[#FFFF00]/60 hover:bg-[#0A0A7A]/80'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleInputChange}
          className="hidden"
          disabled={isUploading}
        />

        {previewUrl ? (
          <>
            <Image
              src={previewUrl}
              alt="Uploaded Preview"
              fill
              sizes="(max-width: 640px) 100vw, 400px"
              className={cn(
                'object-cover transition-opacity duration-200',
                isUploading ? 'opacity-40' : 'opacity-100'
              )}
            />

            {/* Overlays */}
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <span className="text-xs font-bold text-white bg-black/70 px-3 py-1.5 rounded-full border border-white/20">
                Click to Replace
              </span>
            </div>

            {!isUploading && onRemove && (
              <button
                type="button"
                onClick={handleRemove}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                title="Remove image"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {isUploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 text-white gap-2 p-4 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#FFFF00]" />
                <span className="text-xs font-bold text-white">
                  {statusMessage || 'Optimizing & Uploading to Cloudinary...'}
                </span>
                <span className="text-[10px] text-white/60">
                  Target size: ≤ 500 KB with crystal-clear score readability
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2 py-4">
            <div className="w-10 h-10 rounded-full bg-[#1818D4] border border-[#FFFF00]/40 flex items-center justify-center mx-auto text-[#FFFF00]">
              {isUploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <UploadCloud className="w-5 h-5" />
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-bold text-white">
                {isUploading ? statusMessage || 'Uploading...' : 'Click or drag & drop to upload'}
              </p>
              <p className="text-[11px] text-white/50">
                {isScreenshotEvidence
                  ? 'JPEG, PNG, WebP • Max original 2 MB • Auto-compressed to ≤ 500 KB'
                  : `JPEG, PNG, or WebP (Max ${maxSizeMB} MB)`}
              </p>
            </div>
          </div>
        )}
      </div>

      {compressionInfo && (
        <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Auto-compressed: <strong>{compressionInfo.originalKB} KB</strong> →{' '}
              <strong className="text-white">{compressionInfo.compressedKB} KB</strong> (Score clarity verified)
            </span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/25 px-2 py-0.5 rounded-full text-emerald-200 shrink-0">
            ≤ 500 KB
          </span>
        </div>
      )}

      {helperText && <p className="text-[11px] text-white/50">{helperText}</p>}
    </div>
  );
}
