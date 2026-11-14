'use client';

export interface RenderStats {
  longTaskCount: number;
  longestTaskMs: number;
  lastTaskDurationMs: number;
  renderCount: number;
}

type RenderListener = (stats: RenderStats) => void;

class RenderMonitor {
  private longTaskCount: number = 0;
  private longestTaskMs: number = 0;
  private lastTaskDurationMs: number = 0;
  private renderCount: number = 0;
  private listeners: Set<RenderListener> = new Set();
  private observer: PerformanceObserver | null = null;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') return;

    try {
      if ('PerformanceObserver' in window && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        this.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.longTaskCount++;
            this.lastTaskDurationMs = Math.round(entry.duration);
            if (entry.duration > this.longestTaskMs) {
              this.longestTaskMs = Math.round(entry.duration);
            }
            this.notify();
          }
        });
        this.observer.observe({ entryTypes: ['longtask'] });
      }
    } catch {
      // Non-blocking fallback if longtask unsupported
    }
  }

  public recordRender() {
    this.renderCount++;
    this.notify();
  }

  private notify() {
    const stats = this.getStats();
    this.listeners.forEach((fn) => {
      try {
        fn(stats);
      } catch {}
    });
  }

  public getStats(): RenderStats {
    return {
      longTaskCount: this.longTaskCount,
      longestTaskMs: this.longestTaskMs,
      lastTaskDurationMs: this.lastTaskDurationMs,
      renderCount: this.renderCount,
    };
  }

  public subscribe(listener: RenderListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const renderMonitor = new RenderMonitor();
