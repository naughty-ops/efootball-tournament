import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { VIEWPORTS } from '../config/environments';

export interface AgentContext {
  agentId: string;
  name: string;
  context: BrowserContext;
  page: Page;
  consoleErrors: string[];
  networkErrors: string[];
}

export class AgentManager {
  private browser: Browser | null = null;
  private activeAgents: Map<string, AgentContext> = new Map();

  public async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }
  }

  public async createAgentContext(
    agentId: string,
    name: string,
    viewport = VIEWPORTS.desktopFHD
  ): Promise<AgentContext> {
    if (!this.browser) await this.initialize();

    // Independent isolated browser context (independent cookies, storage, cache)
    const context = await this.browser!.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      userAgent: `eFootball-AutonomousQA-Agent/${agentId} (Playwright; Windows NT 10.0; Win64; x64)`,
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Capture network failures
    page.on('requestfailed', (req) => {
      const failure = req.failure();
      // Ignore aborts on navigation
      if (failure?.errorText !== 'net::ERR_ABORTED') {
        networkErrors.push(`${req.method()} ${req.url()} -> ${failure?.errorText || 'FAILED'}`);
      }
    });

    const agentCtx: AgentContext = {
      agentId,
      name,
      context,
      page,
      consoleErrors,
      networkErrors,
    };

    this.activeAgents.set(agentId, agentCtx);
    return agentCtx;
  }

  public async closeAgent(agentId: string): Promise<void> {
    const agentCtx = this.activeAgents.get(agentId);
    if (agentCtx) {
      await agentCtx.context.close().catch(() => {});
      this.activeAgents.delete(agentId);
    }
  }

  public async shutdown(): Promise<void> {
    for (const [id] of this.activeAgents) {
      await this.closeAgent(id);
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
