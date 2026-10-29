import * as fs from 'fs';
import * as path from 'path';

function findRoutes(dir: string, baseRoute = ''): string[] {
  const routes: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'api' || entry.name === 'node_modules' || entry.name.startsWith('_')) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const segment = entry.name;
      // Skip route groups like (public)
      const nextBase = segment.startsWith('(') && segment.endsWith(')') ? baseRoute : `${baseRoute}/${segment}`;
      routes.push(...findRoutes(fullPath, nextBase));
    } else if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
      routes.push(baseRoute === '' ? '/' : baseRoute);
    }
  }
  return routes;
}

const allRoutes = Array.from(new Set(findRoutes('./app'))).sort();
console.log('Total discovered routes:', allRoutes.length);
allRoutes.forEach((r) => console.log('ROUTE:', r));
