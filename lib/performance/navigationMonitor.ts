'use client';

export interface NavigationRecord {
  from: string;
  to: string;
  durationMs: number;
  timestamp: number;
  status: 'fast' | 'moderate' | 'slow';
}

type NavigationListener = (record: NavigationRecord, records: NavigationRecord[]) => void;

class NavigationMonitor {
  private records: NavigationRecord[] = [];
  private listeners: Set<NavigationListener> = new Set();
  private lastClickTime: number = 0;
  private currentFrom: string = '';

  constructor() {
    if (typeof window !== 'undefined') {
      // Intercept link clicks to capture the exact user tap timestamp
      window.addEventListener(
        'click',
        (e) => {
          const target = (e.target as HTMLElement)?.closest('a');
          if (target && target.href && !target.href.startsWith('mailto:') && !target.href.startsWith('tel:')) {
            const destUrl = new URL(target.href, window.location.href);
            if (destUrl.origin === window.location.origin) {
              this.lastClickTime = performance.now();
              this.currentFrom = window.location.pathname;
            }
          }
        },
        { capture: true, passive: true }
      );
    }
  }

  public recordRouteTransition(newPath: string) {
    if (typeof window === 'undefined') return;

    const now = performance.now();
    const duration = this.lastClickTime > 0 ? Math.round(now - this.lastClickTime) : 0;
    const from = this.currentFrom || (this.records.length > 0 ? this.records[this.records.length - 1].to : 'direct');

    if (from !== newPath && duration > 0) {
      let status: 'fast' | 'moderate' | 'slow' = 'fast';
      if (duration > 500) status = 'slow';
      else if (duration > 150) status = 'moderate';

      const rec: NavigationRecord = {
        from,
        to: newPath,
        durationMs: duration,
        timestamp: Date.now(),
        status,
      };

      this.records.push(rec);
      if (this.records.length > 50) this.records.shift();

      this.listeners.forEach((fn) => {
        try {
          fn(rec, this.records);
        } catch {}
      });
    }

    this.lastClickTime = 0;
    this.currentFrom = newPath;
  }

  public getRecords(): NavigationRecord[] {
    return [...this.records];
  }

  public getAverageDuration(): number {
    if (this.records.length === 0) return 0;
    const sum = this.records.reduce((acc, r) => acc + r.durationMs, 0);
    return Math.round(sum / this.records.length);
  }

  public subscribe(listener: NavigationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const navigationMonitor = new NavigationMonitor();
