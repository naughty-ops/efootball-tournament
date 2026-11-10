import * as fs from 'fs';
import * as path from 'path';
import type { Page } from 'playwright';

export class EvidenceManager {
  private screenshotDir: string;
  private artifactsDir: string;

  constructor() {
    this.screenshotDir = path.resolve(process.cwd(), 'qa', 'screenshots');
    this.artifactsDir = path.resolve(process.cwd(), 'qa', 'artifacts');
    if (!fs.existsSync(this.screenshotDir)) fs.mkdirSync(this.screenshotDir, { recursive: true });
    if (!fs.existsSync(this.artifactsDir)) fs.mkdirSync(this.artifactsDir, { recursive: true });
  }

  public async captureScreenshot(page: Page, testId: string, label: string): Promise<string> {
    try {
      const sanitizedLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${testId}_${sanitizedLabel}_${Date.now()}.png`;
      const fullPath = path.join(this.screenshotDir, filename);
      await page.screenshot({ path: fullPath, fullPage: false, timeout: 5000 });
      return `qa/screenshots/${filename}`;
    } catch (err: any) {
      console.warn(`Failed to capture screenshot for ${testId}:`, err.message);
      return '';
    }
  }

  public saveArtifact(filename: string, content: any) {
    const target = path.join(this.artifactsDir, filename);
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    fs.writeFileSync(target, data, 'utf-8');
  }
}
