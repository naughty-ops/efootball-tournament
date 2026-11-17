import * as fs from 'fs';
import * as path from 'path';

// Check file sizes and dimensions
const ARTIFACTS_DIR = 'C:\\Users\\aser\\.gemini\\antigravity\\brain\\686ee328-53f1-4506-8d19-8fb8ea8f2fcd';
const files = [
  'footer_scrolled_bottom_desktop_1280.png',
  'footer_scrolled_bottom_desktop_1920.png',
  'footer_scrolled_bottom_mobile_390.png'
];

for (const f of files) {
  const fp = path.join(ARTIFACTS_DIR, f);
  if (fs.existsSync(fp)) {
    const stat = fs.statSync(fp);
    console.log(`${f}: ${stat.size} bytes`);
  }
}
