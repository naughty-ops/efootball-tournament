'use client';

import React from 'react';
import { CheckCircle2, Circle, Radio, Trophy } from 'lucide-react';
import { TournamentSubStage } from '@/lib/lifecycle/lifecycleEngine';

interface StageProgressIndicatorProps {
  format: 'knockout' | 'league' | 'group_knockout';
  subStage: TournamentSubStage;
}

interface StepItem {
  id: TournamentSubStage;
  label: string;
}

export function StageProgressIndicator({ format, subStage }: StageProgressIndicatorProps) {
  const steps: StepItem[] =
    format === 'group_knockout'
      ? [
          { id: 'registration', label: 'Registration' },
          { id: 'group_stage', label: 'Group Stage' },
          { id: 'group_stage_finalized', label: 'Qualification' },
          { id: 'knockout', label: 'Knockout' },
          { id: 'final', label: 'Final' },
          { id: 'completed', label: 'Completed' },
        ]
      : [
          { id: 'registration', label: 'Registration' },
          { id: 'knockout', label: 'Knockout' },
          { id: 'final', label: 'Final' },
          { id: 'completed', label: 'Completed' },
        ];

  const getStepIndex = (stage: TournamentSubStage) => {
    if (stage === 'draft') return 0;
    const idx = steps.findIndex((s) => s.id === stage);
    return idx >= 0 ? idx : 0;
  };

  const currentIndex = getStepIndex(subStage);

  return (
    <div className="w-full bg-white border border-border rounded-2xl p-4 shadow-xs space-y-3">
      <div className="flex items-center justify-between font-mono text-xs font-bold text-muted-foreground pb-2 border-b border-border/50">
        <span className="text-[#0B3323] uppercase tracking-wider text-[11px]">
          Tournament Lifecycle Progress
        </span>
        <span className="text-primary font-bold">
          Stage: <span className="capitalize">{subStage.replace(/_/g, ' ')}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
        {steps.map((step, idx) => {
          const isDone = subStage === 'completed' || idx < currentIndex;
          const isCurrent = subStage !== 'completed' && idx === currentIndex;

          return (
            <div
              key={step.id}
              className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all ${
                isCurrent
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-xs'
                  : isDone
                  ? 'bg-[#F4F8F5] border-border text-[#0B3323]'
                  : 'bg-white border-border/60 text-muted-foreground opacity-60'
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : isCurrent ? (
                step.id === 'final' ? (
                  <Trophy className="h-4 w-4 text-amber-600 shrink-0 animate-bounce" />
                ) : (
                  <Radio className="h-4 w-4 text-primary shrink-0 animate-pulse" />
                )
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              )}
              <span className="truncate">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
