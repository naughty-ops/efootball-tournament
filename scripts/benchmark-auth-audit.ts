import http from 'http';
import fs from 'fs';
import { createServerClient } from '@supabase/ssr';

interface BenchmarkResult {
  name: string;
  runs: number[];
  avgMs: number;
  minMs: number;
  maxMs: number;
}

function fetchHttp(path: string, cookieHeader?: string): Promise<{ status: number; timeMs: number; location?: string }> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.request(`http://localhost:3000${path}`, {
      headers: {
        'User-Agent': 'Benchmark/1.0',
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

async function runBenchmark(label: string) {
  console.log(`\n======================================================`);
  console.log(`BENCHMARK RUN: ${label.toUpperCase()}`);
  console.log(`======================================================`);

  const authState = JSON.parse(fs.readFileSync('scripts/auth_storage_state.json', 'utf8'));
  const cookieHeader = authState.cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

  const targets = [
    { name: '1. Public Landing Page (/)', path: '/', useCookie: false },
    { name: '2. Login Page (/auth/login)', path: '/auth/login', useCookie: false },
    { name: '3. Authenticated Login Redirect (/auth/login?next=...)', path: '/auth/login?next=%2Fdashboard%2Fmatches', useCookie: true },
    { name: '4. Dashboard (/dashboard)', path: '/dashboard', useCookie: true },
    { name: '5. Dashboard Matches (/dashboard/matches)', path: '/dashboard/matches', useCookie: true },
  ];

  const results: BenchmarkResult[] = [];

  for (const t of targets) {
    const runs: number[] = [];
    console.log(`\nTesting ${t.name}...`);
    for (let i = 0; i < 5; i++) {
      const res = await fetchHttp(t.path, t.useCookie ? cookieHeader : undefined);
      runs.push(res.timeMs);
      console.log(`  Run ${i + 1}: ${res.timeMs}ms (Status: ${res.status}${res.location ? ` -> ${res.location}` : ''})`);
    }
    const avg = Math.round(runs.reduce((a, b) => a + b, 0) / runs.length);
    const min = Math.min(...runs);
    const max = Math.max(...runs);
    results.push({ name: t.name, runs, avgMs: avg, minMs: min, maxMs: max });
  }

  // Benchmark 6: Supabase Auth direct call (5 runs)
  console.log(`\nTesting 6. Supabase Auth Direct getUser()...`);
  const envFile = fs.readFileSync('.env.local', 'utf8');
  let supabaseUrl = '';
  let supabaseAnonKey = '';
  for (const line of envFile.split('\n')) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) supabaseAnonKey = line.split('=')[1].trim();
  }

  const authRuns: number[] = [];

  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return authState.cookies.map((c: any) => ({ name: c.name, value: c.value }));
        },
        setAll() {}
      }
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    const dur = Math.round(performance.now() - start);
    authRuns.push(dur);
    console.log(`  Auth Run ${i + 1}: ${dur}ms (User: ${user ? user.id.slice(0, 8) : 'null'}, Error: ${error?.message || 'none'})`);
  }
  results.push({
    name: '6. Supabase auth.getUser() direct',
    runs: authRuns,
    avgMs: Math.round(authRuns.reduce((a, b) => a + b, 0) / authRuns.length),
    minMs: Math.min(...authRuns),
    maxMs: Math.max(...authRuns),
  });

  // Benchmark 7: Dashboard database queries direct
  console.log(`\nTesting 7. Dashboard Database Queries Direct...`);
  const dbRuns: number[] = [];
  const testUserId = '4426a75f-a44d-4940-a3ac-263abf3dfeeb'; // from auth_storage_state

  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return authState.cookies.map((c: any) => ({ name: c.name, value: c.value }));
        },
        setAll() {}
      }
    });
    // Profile
    const p1 = supabase.from('profiles').select('id, full_name, efootball_id, avatar_url').eq('id', testUserId).single();
    // Tournaments
    const p2 = supabase.from('tournaments').select('id, title, status').limit(5);
    // Matches
    const p3 = supabase.from('tournament_matches').select('id, round, status').limit(5);

    await Promise.all([p1, p2, p3]);
    const dur = Math.round(performance.now() - start);
    dbRuns.push(dur);
    console.log(`  DB Run ${i + 1}: ${dur}ms`);
  }
  results.push({
    name: '7. Dashboard Database Queries (Direct)',
    runs: dbRuns,
    avgMs: Math.round(dbRuns.reduce((a, b) => a + b, 0) / dbRuns.length),
    minMs: Math.min(...dbRuns),
    maxMs: Math.max(...dbRuns),
  });

  console.log(`\n--- BENCHMARK SUMMARY (${label.toUpperCase()}) ---`);
  console.table(results.map(r => ({
    Target: r.name,
    'Run 1': `${r.runs[0]}ms`,
    'Run 2': `${r.runs[1]}ms`,
    'Run 3': `${r.runs[2]}ms`,
    'Run 4': `${r.runs[3]}ms`,
    'Run 5': `${r.runs[4]}ms`,
    'Avg': `${r.avgMs}ms`,
    'Min': `${r.minMs}ms`,
    'Max': `${r.maxMs}ms`,
  })));

  fs.writeFileSync(`scripts/benchmark_${label.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`, JSON.stringify(results, null, 2));
}

const mode = process.argv[2] || 'baseline';
runBenchmark(mode).catch(console.error);
