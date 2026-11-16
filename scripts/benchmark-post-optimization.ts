import fs from 'fs';
import http from 'http';

interface RunResult {
  durationMs: number;
  statusCode: number;
  payloadBytes: number;
}

interface BenchmarkStats {
  name: string;
  category: string;
  authType: 'Unauthenticated' | 'Authenticated';
  samples: number;
  runs: number[];
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  minMs: number;
  avgPayloadBytes: number;
}

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

function fetchUrl(path: string, cookie?: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const headers: Record<string, string> = {
      'User-Agent': 'Benchmark-PostOptimization/1.0',
    };
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method: 'GET',
        headers,
      },
      (res) => {
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
        });
        res.on('end', () => {
          const durationMs = Math.round(performance.now() - start);
          resolve({
            durationMs,
            statusCode: res.statusCode || 0,
            payloadBytes: bytes,
          });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

async function benchmarkTarget(
  target: { name: string; path: string; authType: 'Unauthenticated' | 'Authenticated'; cookie?: string; category: string },
  runsCount: number
): Promise<BenchmarkStats> {
  console.log(`\nBenchmarking: ${target.name} (${target.authType}) - ${runsCount} runs...`);
  
  // 1 Warmup request (not counted)
  try {
    const warm = await fetchUrl(target.path, target.cookie);
    console.log(`  Warmup: ${warm.durationMs}ms (${warm.statusCode}, ${warm.payloadBytes} bytes)`);
  } catch (e) {
    console.warn(`Warmup failed for ${target.name}:`, e);
  }

  const times: number[] = [];
  const payloadSizes: number[] = [];

  for (let i = 1; i <= runsCount; i++) {
    try {
      const res = await fetchUrl(target.path, target.cookie);
      times.push(res.durationMs);
      payloadSizes.push(res.payloadBytes);
      process.stdout.write(`  Run ${i}/${runsCount}: ${res.durationMs}ms (${res.statusCode}, ${res.payloadBytes} bytes)\n`);
    } catch (err: any) {
      console.error(`  Run ${i} failed:`, err.message);
    }
  }

  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const avgMs = Math.round(sum / times.length);
  const medianMs = sorted[Math.floor(sorted.length / 2)];
  const p95Ms = calculatePercentile(sorted, 95);
  const minMs = sorted[0];
  const maxMs = sorted[sorted.length - 1];
  const avgPayloadBytes = Math.round(payloadSizes.reduce((a, b) => a + b, 0) / payloadSizes.length);

  return {
    name: target.name,
    category: target.category,
    authType: target.authType,
    samples: times.length,
    runs: times,
    avgMs,
    medianMs,
    p95Ms,
    minMs,
    maxMs,
    avgPayloadBytes,
  };
}

async function main() {
  console.log('================================================================');
  console.log('   POST-OPTIMIZATION 20-RUN REALISTIC BENCHMARKS               ');
  console.log('================================================================');

  const playerState = JSON.parse(fs.readFileSync('scripts/auth_storage_state.json', 'utf8'));
  const playerCookie = playerState.cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

  let adminCookie = playerCookie;
  try {
    const adminState = JSON.parse(fs.readFileSync('scripts/admin_storage_state.json', 'utf8'));
    adminCookie = adminState.cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
  } catch {
    // fallback
  }

  console.log(`Player Cookie loaded (${playerCookie.length} chars)`);
  console.log(`Admin Cookie loaded (${adminCookie.length} chars)`);

  const targets = [
    { name: '1. Homepage (/)', path: '/', authType: 'Unauthenticated' as const, category: 'Public Route' },
    { name: '2. Login (/auth/login)', path: '/auth/login', authType: 'Unauthenticated' as const, category: 'Auth Page' },
    { name: '3. Dashboard (/dashboard)', path: '/dashboard', authType: 'Authenticated' as const, cookie: playerCookie, category: 'Protected Dashboard' },
    { name: '4. Matches (/dashboard/matches)', path: '/dashboard/matches', authType: 'Authenticated' as const, cookie: playerCookie, category: 'Protected Matches' },
    { name: '5. Admin Dashboard (/admin/dashboard)', path: '/admin/dashboard', authType: 'Authenticated' as const, cookie: adminCookie, category: 'Protected Admin' },
  ];

  const results: BenchmarkStats[] = [];
  const RUNS = 20;

  for (const t of targets) {
    const stats = await benchmarkTarget(t, RUNS);
    results.push(stats);
  }

  console.log('\n================================================================');
  console.log('   POST-OPTIMIZATION 20-RUN BENCHMARK SUMMARY TABLE            ');
  console.log('================================================================\n');

  console.table(
    results.map((r) => ({
      Target: r.name,
      Auth: r.authType,
      Median: `${r.medianMs}ms`,
      Average: `${r.avgMs}ms`,
      P95: `${r.p95Ms}ms`,
      Max: `${r.maxMs}ms`,
      Min: `${r.minMs}ms`,
      Payload: `${(r.avgPayloadBytes / 1024).toFixed(1)} KB`,
    }))
  );

  fs.writeFileSync('scripts/benchmark_post_optimization_20runs.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to scripts/benchmark_post_optimization_20runs.json');
}

main().catch(console.error);
