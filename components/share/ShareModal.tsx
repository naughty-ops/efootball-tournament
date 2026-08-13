'use client';

import React, { useState, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Share2,
  Copy,
  Check,
  Download,
  QrCode,
  Globe,
  X,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentId: string;
  tournamentName: string;
}

export function ShareModal({ isOpen, onClose, tournamentId, tournamentName }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Generate dynamic public URL (works locally, preview, and production)
  const getPublicUrl = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/t/${tournamentId}`;
    }
    const domain = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${domain}/t/${tournamentId}`;
  };

  const publicUrl = getPublicUrl();

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleDownloadQR = () => {
    if (!qrRef.current) return;
    const svgElement = qrRef.current.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 40;
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 20, 20);
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        const safeName = tournamentName.replace(/[^a-zA-Z0-9]/g, '_');
        downloadLink.download = `${safeName}_QR.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: tournamentName,
          text: `Follow live matches and results for ${tournamentName} on eFootball Tournament Platform!`,
          url: publicUrl,
        });
      } catch (err) {
        console.log('User cancelled share', err);
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl z-10 space-y-5 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-[#0B3323] text-emerald-400 flex items-center justify-center shrink-0 shadow-xs">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#0B3323] tracking-tight">
                Share Public Tournament
              </h3>
              <p className="text-xs text-slate-500 font-semibold truncate max-w-[220px]">
                {tournamentName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Public URL Box */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-extrabold uppercase text-[#0B3323] tracking-wider block">
              Permanent Public URL
            </label>
            <Badge className="bg-emerald-600 text-white font-bold text-[9px] uppercase border-0">
              PUBLIC READ-ONLY
            </Badge>
          </div>

          <div className="flex items-center gap-2 p-1.5 bg-slate-50 rounded-2xl border border-slate-200">
            <input
              type="text"
              readOnly
              value={publicUrl}
              className="flex-1 bg-transparent px-3 py-1 text-xs font-mono text-[#0B3323] outline-none truncate"
            />
            <Button
              size="sm"
              onClick={handleCopyLink}
              className={cn(
                'h-8 px-3 text-xs font-bold gap-1.5 rounded-xl transition-all shadow-2xs shrink-0',
                copied
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-[#0B3323] hover:bg-[#0B3323]/90 text-white'
              )}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Link'}</span>
            </Button>
          </div>
        </div>

        {/* QR Code Section */}
        <Card className="p-4 bg-gradient-to-b from-[#F4F8F5] to-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-black text-[#0B3323] uppercase tracking-wider">
            <QrCode className="h-4 w-4 text-emerald-600" />
            <span>Tournament QR Code</span>
          </div>

          <div ref={qrRef} className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
            <QRCodeSVG
              value={publicUrl}
              size={160}
              bgColor="#FFFFFF"
              fgColor="#0B3323"
              level="H"
              includeMargin={false}
            />
          </div>

          <div className="flex items-center gap-2 w-full pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadQR}
              className="flex-1 h-8 text-xs font-bold gap-1.5 border-slate-300 text-[#0B3323] rounded-xl hover:bg-emerald-50"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600" />
              <span>Download QR</span>
            </Button>

            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <Button
                size="sm"
                onClick={handleNativeShare}
                className="flex-1 h-8 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-2xs"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share App</span>
              </Button>
            )}
          </div>
        </Card>

        {/* Public Access Note */}
        <div className="flex items-center justify-between px-3 py-2 bg-emerald-50/70 border border-emerald-200 rounded-xl text-[11px] text-emerald-950 font-semibold">
          <span className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>Anyone with this link can view matches & bracket.</span>
          </span>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-700 hover:text-emerald-900 font-extrabold flex items-center gap-1 hover:underline shrink-0"
          >
            <span>Preview</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
