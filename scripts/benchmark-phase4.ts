import http from 'http';
import fs from 'fs';
import { createServerClient } from '@supabase/ssr';

interface BenchmarkStats {
  name: string;
  category: string;
  samples: number;
  runs: number[];
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

function computeStats(name: string, category: string, runs: number[]): BenchmarkStats {
  const sorted = [...runs].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avgMs = Math.round(sum / sorted.length);
  const medianMs = calculatePercentile(sorted, 50);
  const p95Ms = calculatePercentile(sorted, 95);
  return {
    name,
    category,
    samples: sorted.length,
    runs,
    avgMs,
    medianMs,
    p95Ms,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
  };
}

function fetchHttp(path: string, cookieHeader?: string): Promise<{ status: number; timeMs: number; location?: string }> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.request(`http://localhost:3000${path}`, {
      headers: {
        'User-Agent': 'Phase4AuditBenchmark/1.0',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    }, (res) => {
      res.resume();
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          timeMs: Math.round(performance.now() - start),
          location: res.headers['location'],
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('================================================================');
  console.log('PHASE 4: REALISTIC BENCHMARK (10 WARMED RUNS PER TARGET)');
  console.log('================================================================\n');

  const playerState = JSON.parse(fs.readFileSync('scripts/auth_storage_state.json', 'utf8'));
  const playerCookie = playerState.cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

  let adminCookie = '';
  try {
    const adminState = JSON.parse(fs.readFileSync('scripts/admin_storage_state.json', 'utf8'));
    adminCookie = adminState.cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
  } catch {
    console.warn('Admin storage state not found, using player cookie');
    adminCookie = playerCookie;
  }

  const envFile = fs.readFileSync('.env.local', 'utf8');
  let supabaseUrl = '';
  let supabaseAnonKey = '';
  for (const line of envFile.split('\n')) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) supabaseAnonKey = line.split('=')[1].trim();
  }

  const targets = [
    { name: '1. Homepage (/)', path: '/', cookie: undefined, category: 'Public Route' },
    { name: '2. Login (/auth/login)', path: '/auth/login', cookie: undefined, category: 'Auth Page' },
    { name: '3. Dashboard (/dashboard)', path: '/dashboard', cookie: playerCookie, category: 'Protected Dashboard' },
    { name: '4. Dashboard Matches (/dashboard/matches)', path: '/dashboard/matches', cookie: playerCookie, category: 'Protected Matches' },
    { name: '5. Admin Dashboard (/admin/dashboard)', path: '/admin/dashboard', cookie: adminCookie, category: 'Protected Admin' },
  ];

  const allStats: BenchmarkStats[] = [];

  for (const t of targets) {
    console.log(`Testing ${t.name}...`);
    // Warm-up request (not included in stats)
    await fetchHttp(t.path, t.cookie);

    const runs: number[] = [];
    for (let i = 1; i <= 10; i++) {
      const res = await fetchHttp(t.path, t.cookie);
      runs.push(res.timeMs);
      process.stdout.write(`  Run ${i}: ${res.timeMs}ms (Status: ${res.status}${res.location ? ` -> ${res.location}` : ''})\n`);
    }

    const stat = computeStats(t.name, t.category, runs);
    allStats.push(stat);
    console.log(`  -> Avg: ${stat.avgMs}ms | Median: ${stat.medianMs}ms | P95: ${stat.p95Ms}ms | Min: ${stat.minMs}ms | Max: ${stat.maxMs}ms\n`);
  }

  // 6. Supabase authentication (10 warmed runs)
  console.log(`Testing 6. Supabase Authentication (getUser)...`);
  const authRuns: number[] = [];
  // Warm-up
  const warmClient = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return playerState.cookies.map((c: any) => ({ name: c.name, value: c.value }));
      },
      setAll() {}
    }
  });
  await warmClient.auth.getUser();

  for (let i = 1; i <= 10; i++) {
    const start = performance.now();
    const client = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return playerState.cookies.map((c: any) => ({ name: c.name, value: c.value }));
        },
        setAll() {}
      }
    });
    const { data: { user } } = await client.auth.getUser();
    const dur = Math.round(performance.now() - start);
    authRuns.push(dur);
    console.log(`  Auth Run ${i}: ${dur}ms (User: ${user ? user.id.slice(0, 8) : 'null'})`);
  }
  const authStat = computeStats('6. Supabase auth.getUser()', 'Remote Network Auth', authRuns);
  allStats.push(authStat);
  console.log(`  -> Avg: ${authStat.avgMs}ms | Median: ${authStat.medianMs}ms | P95: ${authStat.p95Ms}ms\n`);

  // 7. Database queries (10 warmed runs)
  console.log(`Testing 7. Database Queries (Direct Supabase REST)...`);
  const dbRuns: number[] = [];
  const testUserId = '4426a75f-a44d-4940-a3ac-263abf3dfeeb';

  // Warm-up
  const warmDbClient = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return playerState.cookies.map((c: any) => ({ name: c.name, value: c.value }));
      },
      setAll() {}
    }
  });
  await Promise.all([
    warmDbClient.from('profiles').select('id, display_name').eq('id', testUserId).maybeSingle(),
    warmDbClient.from('tournaments').select('id, name').limit(5),
  ]);

  for (let i = 1; i <= 10; i++) {
    const start = performance.now();
    const client = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return playerState.cookies.map((c: any) => ({ name: c.name, value: c.value }));
        },
        setAll() {}
      }
    });
    const p1 = client.from('profiles').select('id, display_name, efootball_id, avatar_url').eq('id', testUserId).maybeSingle();
    const p2 = client.from('tournaments').select('id, name, format, status').limit(10);
    const p3 = client.from('matches').select('id, status, scheduled_time').limit(10);
    await Promise.all([p1, p2, p3]);
    const dur = Math.round(performance.now() - start);
    dbRuns.push(dur);
    console.log(`  DB Run ${i}: ${dur}ms`);
  }
  const dbStat = computeStats('7. Database Queries Direct', 'Remote Network Database', dbRuns);
  allStats.push(dbStat);
  console.log(`  -> Avg: ${dbStat.avgMs}ms | Median: ${dbStat.medianMs}ms | P95: ${dbStat.p95Ms}ms\n`);

  console.log('\n================================================================');
  console.log('REALISTIC BENCHMARK SUMMARY (10 WARMED RUNS)');
  console.log('================================================================');
  console.table(allStats.map(s => ({
    Target: s.name,
    Category: s.category,
    'Median (ms)': s.medianMs,
    'Avg (ms)': s.avgMs,
    'P95 (ms)': s.p95Ms,
    'Min (ms)': s.minMs,
    'Max (ms)': s.maxMs,
  })));

  fs.writeFileSync('scripts/benchmark_phase4_results.json', JSON.stringify(allStats, null, 2));
}

main().catch(console.error);
