import * as path from 'path';
import * as fs from 'fs';

// Load .env.local if present
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

export const ENV = {
  productionUrl: 'https://efootball-tournament-cyan.vercel.app',
  localUrl: 'http://localhost:3000',
  activeTarget: (process.env.QA_TARGET_URL || 'http://localhost:3000').replace(/\/$/, ''),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  adminEmail: process.env.TEST_AUTH_USER_EMAIL || 'ye.agrajj@gmail.com',
  adminUserId: process.env.TEST_AUTH_USER_ID || '30080df7-5188-4630-b597-b8493ebe045d',
};

export const VIEWPORTS = {
  desktopFHD: { width: 1920, height: 1080, name: 'Desktop FHD (1920x1080)' },
  desktopHD: { width: 1440, height: 900, name: 'Desktop HD (1440x900)' },
  desktopSmall: { width: 1366, height: 768, name: 'Desktop Small (1366x768)' },
  tablet: { width: 768, height: 1024, name: 'Tablet iPad (768x1024)' },
  mobileLarge: { width: 390, height: 844, name: 'Mobile iPhone 14 (390x844)' },
  mobileMedium: { width: 360, height: 800, name: 'Mobile Android (360x800)' },
  mobileCompact: { width: 320, height: 700, name: 'Mobile Compact (320x700)' },
};
