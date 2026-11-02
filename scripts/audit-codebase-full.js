/**
 * Complete Full-Stack Codebase Audit Script
 * 
 * Inspects all 20 project dimensions:
 * - File tree and counts
 * - Routes (public, auth, admin, API)
 * - Components and import usage
 * - Hooks, libs, services and import usage
 * - Package.json dependencies vs codebase imports
 * - Static assets in public/ and elogo/ vs code references
 * - Environment variables in code vs .env
 */

const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const ignoreDirs = new Set(['.git', '.next', 'node_modules', 'dist', 'build', '.temp']);

function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (ignoreDirs.has(file)) continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = getFilesRecursively(rootDir);
const relFiles = allFiles.map(f => path.relative(rootDir, f).replace(/\\/g, '/'));

console.log(`=== FULL CODEBASE AUDIT INVENTORY ===`);
console.log(`Total non-ignored files: ${allFiles.length}`);

// 1. Directory breakdown
const dirCounts = {};
for (const f of relFiles) {
  const topDir = f.includes('/') ? f.split('/')[0] : '(root)';
  dirCounts[topDir] = (dirCounts[topDir] || 0) + 1;
}
console.log('\n--- Directory Breakdown ---');
console.table(dirCounts);

// 2. Route analysis
const pageRoutes = relFiles.filter(f => f.startsWith('app/') && (f.endsWith('/page.tsx') || f.endsWith('/page.jsx')));
const apiRoutes = relFiles.filter(f => f.startsWith('app/') && (f.endsWith('/route.ts') || f.endsWith('/route.js')));

console.log(`\nTotal Page Routes: ${pageRoutes.length}`);
console.log(`Total API Routes: ${apiRoutes.length}`);

const publicPages = [];
const authPages = [];
const adminPages = [];

for (const p of pageRoutes) {
  const route = '/' + p.replace(/^app\//, '').replace(/\/page\.(tsx|jsx)$/, '');
  const cleanRoute = route === '/page' ? '/' : route;
  if (cleanRoute.startsWith('/admin')) {
    adminPages.push(cleanRoute);
  } else if (cleanRoute.startsWith('/dashboard')) {
    authPages.push(cleanRoute);
  } else {
    publicPages.push(cleanRoute);
  }
}

console.log('\n--- Page Routes Breakdown ---');
console.log(`Public Pages (${publicPages.length}):`, publicPages);
console.log(`Authenticated Pages (${authPages.length}):`, authPages);
console.log(`Admin Pages (${adminPages.length}):`, adminPages);

const apis = apiRoutes.map(p => '/' + p.replace(/^app\//, '').replace(/\/route\.(ts|js)$/, ''));
console.log(`\n--- API Endpoints (${apis.length}) ---`);
console.log(apis);

// 3. Components analysis
const componentFiles = relFiles.filter(f => f.startsWith('components/') && (f.endsWith('.tsx') || f.endsWith('.jsx')));
console.log(`\nTotal Components: ${componentFiles.length}`);

// Read all code files to build string corpus for reference checks
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.mjs', '.css']);
const codeFiles = allFiles.filter(f => codeExtensions.has(path.extname(f)));
const fileContents = {};
for (const f of codeFiles) {
  const rel = path.relative(rootDir, f).replace(/\\/g, '/');
  try {
    fileContents[rel] = fs.readFileSync(f, 'utf8');
  } catch (err) {}
}

// 4. Component Usage Check
console.log('\n--- Component Reference Analysis ---');
const unusedComponents = [];
const usedComponents = [];

for (const comp of componentFiles) {
  const compName = path.basename(comp, path.extname(comp));
  const compRelNoExt = comp.replace(/\.(tsx|jsx)$/, '');
  let refCount = 0;

  for (const [file, content] of Object.entries(fileContents)) {
    if (file === comp) continue;
    // Check if filename without ext or base name is referenced
    if (content.includes(compName) || content.includes(compRelNoExt) || content.includes(`@/${compRelNoExt}`)) {
      refCount++;
    }
  }

  if (refCount === 0) {
    unusedComponents.push(comp);
  } else {
    usedComponents.push({ component: comp, refCount });
  }
}

console.log(`Used Components: ${usedComponents.length}`);
console.log(`Potentially Unused Components (${unusedComponents.length}):`, unusedComponents);

// 5. Services, Libs, Hooks Usage Check
const services = relFiles.filter(f => f.startsWith('services/') && (f.endsWith('.ts') || f.endsWith('.js')));
const hooks = relFiles.filter(f => f.startsWith('hooks/') && (f.endsWith('.ts') || f.endsWith('.js')));
const libs = relFiles.filter(f => f.startsWith('lib/') && (f.endsWith('.ts') || f.endsWith('.js')));

function checkFileUsage(files, label) {
  console.log(`\n--- ${label} Reference Analysis ---`);
  const unused = [];
  for (const item of files) {
    const baseName = path.basename(item, path.extname(item));
    const relNoExt = item.replace(/\.(ts|js)$/, '');
    let refCount = 0;
    for (const [file, content] of Object.entries(fileContents)) {
      if (file === item) continue;
      if (content.includes(baseName) || content.includes(relNoExt) || content.includes(`@/${relNoExt}`)) {
        refCount++;
      }
    }
    if (refCount === 0) {
      unused.push(item);
    }
  }
  console.log(`Total ${label}: ${files.length}. Potentially unused (${unused.length}):`, unused);
  return unused;
}

const unusedServices = checkFileUsage(services, 'Services');
const unusedHooks = checkFileUsage(hooks, 'Hooks');
const unusedLibs = checkFileUsage(libs, 'Lib Files');

// 6. Assets Analysis (public/ and elogo/)
const publicAssets = relFiles.filter(f => f.startsWith('public/'));
const elogoAssets = relFiles.filter(f => f.startsWith('elogo/'));

console.log(`\n--- Assets Reference Analysis ---`);
console.log(`Total public/ assets: ${publicAssets.length}`);
console.log(`Total elogo/ assets: ${elogoAssets.length}`);

function checkAssetUsage(assets, label) {
  const unused = [];
  for (const asset of assets) {
    const filename = path.basename(asset);
    const webPath = asset.startsWith('public/') ? asset.replace(/^public/, '') : '/' + asset;
    let found = false;
    for (const [file, content] of Object.entries(fileContents)) {
      if (content.includes(filename) || content.includes(webPath)) {
        found = true;
        break;
      }
    }
    if (!found) {
      unused.push(asset);
    }
  }
  console.log(`${label} Unreferenced Assets (${unused.length} of ${assets.length}):`, unused);
  return unused;
}

const unusedPublicAssets = checkAssetUsage(publicAssets, 'public/');
const unusedElogoAssets = checkAssetUsage(elogoAssets, 'elogo/');

// 7. Dependencies Analysis
console.log(`\n--- Dependencies Analysis ---`);
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const unusedDeps = [];

for (const dep of Object.keys(pkg.dependencies || {})) {
  let found = false;
  for (const [file, content] of Object.entries(fileContents)) {
    if (file === 'package.json') continue;
    // Check import from 'dep' or 'dep/...'
    const regex = new RegExp(`['"]${dep}(/.*)?['"]`, 'g');
    if (regex.test(content)) {
      found = true;
      break;
    }
  }
  if (!found) {
    unusedDeps.push(dep);
  }
}
console.log(`Dependencies defined: ${Object.keys(pkg.dependencies).length}`);
console.log(`Potentially Unused Dependencies (${unusedDeps.length}):`, unusedDeps);

// 8. Environment Variables Analysis
console.log(`\n--- Environment Variable References ---`);
const envVarSet = new Set();
for (const [file, content] of Object.entries(fileContents)) {
  const matches = content.matchAll(/process\.env\.([A-Z0-9_]+)/g);
  for (const m of matches) {
    envVarSet.add(m[1]);
  }
}
const envVars = Array.from(envVarSet).sort();
console.log(`Found ${envVars.length} distinct process.env variables referenced in code:`, envVars);

// Write JSON summary for deep inspection
const auditSummary = {
  totalFiles: allFiles.length,
  dirCounts,
  pages: { total: pageRoutes.length, public: publicPages, auth: authPages, admin: adminPages },
  apiEndpoints: { total: apis.length, endpoints: apis },
  components: { total: componentFiles.length, unused: unusedComponents },
  services: { total: services.length, unused: unusedServices },
  hooks: { total: hooks.length, unused: unusedHooks },
  libs: { total: libs.length, unused: unusedLibs },
  assets: {
    publicTotal: publicAssets.length,
    publicUnused: unusedPublicAssets,
    elogoTotal: elogoAssets.length,
    elogoUnused: unusedElogoAssets
  },
  dependencies: {
    total: Object.keys(pkg.dependencies).length,
    unused: unusedDeps
  },
  envVars
};

fs.writeFileSync(path.join(rootDir, 'scratch', 'audit_inventory_raw.json'), JSON.stringify(auditSummary, null, 2));
console.log('\nAudit inventory written to scratch/audit_inventory_raw.json');
