'use client';

export interface NetworkRequestRecord {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  isSupabase: boolean;
  isDuplicate: boolean;
  timestamp: number;
}

type NetworkListener = (stats: NetworkStats) => void;

export interface NetworkStats {
  totalRequests: number;
  supabaseRequests: number;
  failedRequests: number;
  slowestRequest: { url: string; durationMs: number } | null;
  averageDurationMs: number;
  duplicateCount: number;
  recentRequests: NetworkRequestRecord[];
}

class NetworkMonitor {
  private requests: NetworkRequestRecord[] = [];
  private listeners: Set<NetworkListener> = new Set();
  private isHooked = false;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined' || this.isHooked) return;
    if (process.env.NODE_ENV === 'production') return;

    this.isHooked = true;
    const originalFetch = window.fetch;

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const start = performance.now();
      const input = args[0];
      const init = args[1];

      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';
      const isSupabase = url.includes('supabase.co') || url.includes('/rest/v1/') || url.includes('/auth/v1/');

      // Check if duplicate request was fired within 1000ms
      const nowTs = Date.now();
      const isDuplicate = this.requests.some(
        (r) => r.url === url && r.method === method && nowTs - r.timestamp < 1000
      );

      try {
        const response = await originalFetch(...args);
        const duration = Math.round(performance.now() - start);

        this.recordRequest({
          url: url.length > 80 ? url.substring(0, 77) + '...' : url,
          method,
          status: response.status,
          durationMs: duration,
          isSupabase,
          isDuplicate,
          timestamp: nowTs,
        });

        return response;
      } catch (err) {
        const duration = Math.round(performance.now() - start);
        this.recordRequest({
          url: url.length > 80 ? url.substring(0, 77) + '...' : url,
          method,
          status: 0,
          durationMs: duration,
          isSupabase,
          isDuplicate,
          timestamp: nowTs,
        });
        throw err;
      }
    };
  }

  private recordRequest(rec: NetworkRequestRecord) {
    this.requests.push(rec);
    if (this.requests.length > 100) this.requests.shift();

    const stats = this.getStats();
    this.listeners.forEach((fn) => {
      try {
        fn(stats);
      } catch {}
    });
  }

  public getStats(): NetworkStats {
    const totalRequests = this.requests.length;
    const supabaseRequests = this.requests.filter((r) => r.isSupabase).length;
    const failedRequests = this.requests.filter((r) => r.status === 0 || r.status >= 400).length;
    const duplicateCount = this.requests.filter((r) => r.isDuplicate).length;

    let slowestRequest: { url: string; durationMs: number } | null = null;
    let totalDuration = 0;

    for (const r of this.requests) {
      totalDuration += r.durationMs;
      if (!slowestRequest || r.durationMs > slowestRequest.durationMs) {
        slowestRequest = { url: r.url, durationMs: r.durationMs };
      }
    }

    const averageDurationMs = totalRequests > 0 ? Math.round(totalDuration / totalRequests) : 0;

    return {
      totalRequests,
      supabaseRequests,
      failedRequests,
      slowestRequest,
      averageDurationMs,
      duplicateCount,
      recentRequests: [...this.requests].slice(-5).reverse(),
    };
  }

  public subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const networkMonitor = new NetworkMonitor();
