/**
 * Load Testing & Traffic Distribution Benchmark Script
 * Runs non-destructive concurrency, rate-limit, and latency benchmark tests.
 */

import http from 'http';

interface TestResult {
  scenario: string;
  totalRequests: number;
  concurrency: number;
  durationMs: number;
  requestsPerSec: number;
  statusCounts: Record<number, number>;
  latenciesMs: number[];
  p50: number;
  p95: number;
  p99: number;
  errorRatePercent: number;
}

function sendRequest(url: string, method = 'GET'): Promise<{ statusCode: number; latency: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request(url, { method }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 500, latency: Date.now() - start });
      });
    });
    req.on('error', () => {
      resolve({ statusCode: 500, latency: Date.now() - start });
    });
    req.end();
  });
}

async function runScenario(
  scenarioName: string,
  url: string,
  totalRequests: number,
  concurrency: number,
  method = 'GET'
): Promise<TestResult> {
  const start = Date.now();
  const latencies: number[] = [];
  const statusCounts: Record<number, number> = {};
  let completed = 0;

  const queue = Array.from({ length: totalRequests }, (_, i) => i);
  const workers = Array.from({ length: Math.min(concurrency, totalRequests) }, async () => {
    while (queue.length > 0) {
      queue.shift();
      const res = await sendRequest(url, method);
      latencies.push(res.latency);
      statusCounts[res.statusCode] = (statusCounts[res.statusCode] || 0) + 1;
      completed++;
    }
  });

  await Promise.all(workers);
  const durationMs = Date.now() - start;

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  const errorCount = Object.entries(statusCounts).reduce((acc, [code, count]) => {
    const statusCode = parseInt(code, 10);
    return statusCode >= 500 ? acc + count : acc;
  }, 0);

  const errorRatePercent = totalRequests > 0 ? Number(((errorCount / totalRequests) * 100).toFixed(2)) : 0;
  const requestsPerSec = durationMs > 0 ? Number(((totalRequests / durationMs) * 1000).toFixed(1)) : 0;

  return {
    scenario: scenarioName,
    totalRequests,
    concurrency,
    durationMs,
    requestsPerSec,
    statusCounts,
    latenciesMs: latencies,
    p50,
    p95,
    p99,
    errorRatePercent,
  };
}

async function main() {
  console.log('==================================================');
  console.log('🚀 EFOOTBALL PLATFORM LOAD BENCHMARK STARTING');
  console.log('==================================================\n');

  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

  // 1. Health Check Load (100 concurrent users)
  const res1 = await runScenario('Test 1: Health Check (100 Concurrent)', `${baseUrl}/api/health`, 100, 20);
  console.log(res1);

  // 2. LiveKit Token API Load (50 requests)
  const res2 = await runScenario('Test 2: LiveKit Token Generation', `${baseUrl}/api/live/token?room=test`, 50, 10);
  console.log(res2);

  // 3. Rate Limit Trigger Test (Rapid repeated requests > threshold)
  const res3 = await runScenario('Test 3: Rate Limiting Enforcement (Auth)', `${baseUrl}/login`, 25, 5);
  console.log(res3);

  console.log('\n==================================================');
  console.log('✅ BENCHMARK COMPLETE');
  console.log('==================================================');
}

if (require.main === module) {
  main().catch(console.error);
}
