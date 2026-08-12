'use client';

import React, { useEffect, useRef } from 'react';
import { Trophy, Award, Medal, Sparkles, X, ChevronRight, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WinnerCelebrationOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentName: string;
  championName: string;
  runnerUpName?: string | null;
  finalScore?: string | null;
  onViewBracket?: () => void;
}

export function WinnerCelebrationOverlay({
  isOpen,
  onClose,
  tournamentName,
  championName,
  runnerUpName,
  finalScore,
  onViewBracket,
}: WinnerCelebrationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Confetti Particle Animation Loop
  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particle pool
    const colors = ['#F59E0B', '#10B981', '#EAB308', '#3B82F6', '#EC4899', '#F43F5E', '#A855F7', '#FFFFFF'];
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      rotation: number;
      vRot: number;
      shape: 'rect' | 'circle';
      opacity: number;
    }> = [];

    // Burst initial particles from center
    const numParticles = Math.min(120, Math.floor(width / 8));
    for (let i = 0; i < numParticles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 12 + 4;
      particles.push({
        x: width / 2,
        y: height / 2.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: Math.random() * 8 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.2,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
        opacity: 1,
      });
    }

    let animId: number;
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p, idx) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18; // Gravity
        p.vx *= 0.98; // Drag
        p.rotation += p.vRot;
        p.opacity -= 0.005;

        if (p.opacity <= 0) {
          particles.splice(idx, 1);
          return;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      });

      if (particles.length > 0) {
        animId = requestAnimationFrame(render);
      }
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto">
      {/* Canvas Confetti Background */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" />

      {/* Esports Spotlight Background Glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-b from-amber-500/25 via-emerald-500/15 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-emerald-950/40 to-transparent" />
      </div>

      {/* Main Celebration Card */}
      <div className="relative z-10 w-full max-w-lg mx-auto bg-gradient-to-b from-slate-900 via-[#0B2518] to-slate-950 border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl text-center text-white space-y-6 animate-in zoom-in-95 duration-300">
        {/* Dismiss Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
          title="Close Celebration"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-black tracking-widest uppercase">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          <span>TOURNAMENT CHAMPIONSHIP</span>
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
        </div>

        {/* Trophy Reveal with Glow */}
        <div className="relative flex justify-center items-center py-2">
          <div className="absolute w-28 h-28 bg-amber-400/20 rounded-full blur-2xl animate-pulse" />
          <div className="relative p-5 rounded-3xl bg-gradient-to-b from-amber-400/20 to-amber-600/10 border border-amber-400/40 shadow-xl transform hover:scale-105 transition-transform">
            <Trophy className="h-16 w-16 text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.6)]" />
          </div>
        </div>

        {/* Tournament Title */}
        <div className="space-y-1">
          <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">{tournamentName}</p>
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">OFFICIAL WINNER</h2>
        </div>

        {/* Champion Name Box */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-400/20 to-amber-500/10 border border-amber-400/50 shadow-inner space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-amber-300 font-extrabold text-xs tracking-wider uppercase">
            <Award className="h-4 w-4 text-amber-400" />
            <span>TOURNAMENT CHAMPION</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 tracking-tight drop-shadow-md truncate">
            {championName}
          </h1>
        </div>

        {/* Secondary Info: Runner-Up & Score */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-left">
          {runnerUpName && (
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
                <Medal className="h-4 w-4 text-slate-300" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Runner-Up</p>
                <p className="font-bold text-slate-200 truncate">{runnerUpName}</p>
              </div>
            </div>
          )}

          {finalScore && (
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-emerald-900/60 flex items-center justify-center shrink-0">
                <Swords className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Final Score</p>
                <p className="font-bold text-emerald-300 font-mono">{finalScore}</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          {onViewBracket && (
            <Button
              onClick={() => {
                onClose();
                onViewBracket();
              }}
              className="w-full sm:w-auto h-10 px-5 font-bold text-xs bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl shadow-lg gap-1.5"
            >
              <span>View Bracket & Details</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}

          <Button
            onClick={onClose}
            variant="outline"
            className="w-full sm:w-auto h-10 px-5 font-bold text-xs border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
