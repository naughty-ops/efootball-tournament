export type TestStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT TESTED' | 'INCONCLUSIVE';
export type TestSeverity = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface TestCaseRecord {
  testId: string;
  agentId: string;
  category: string;
  title: string;
  description: string;
  preconditions: string;
  steps: string[];
  expected: string;
  actual: string;
  status: TestStatus;
  severity: TestSeverity;
  timestamp: string;
  durationMs: number;
  browser: string;
  viewport: string;
  screenshotPath?: string;
  consoleErrors: string[];
  networkErrors: string[];
  dbEvidence?: string;
  notes?: string;
}

export class ExecutionTracker {
  private static instance: ExecutionTracker;
  private records: TestCaseRecord[] = [];

  private constructor() {}

  public static getInstance(): ExecutionTracker {
    if (!ExecutionTracker.instance) {
      ExecutionTracker.instance = new ExecutionTracker();
    }
    return ExecutionTracker.instance;
  }

  public record(item: TestCaseRecord) {
    this.records.push(item);
  }

  public getRecords(): TestCaseRecord[] {
    return this.records;
  }

  public getByAgent(agentId: string): TestCaseRecord[] {
    return this.records.filter((r) => r.agentId === agentId);
  }

  public getByCategory(category: string): TestCaseRecord[] {
    return this.records.filter((r) => r.category.toLowerCase() === category.toLowerCase());
  }

  public getSummary() {
    const total = this.records.length;
    const passed = this.records.filter((r) => r.status === 'PASS').length;
    const failed = this.records.filter((r) => r.status === 'FAIL').length;
    const blocked = this.records.filter((r) => r.status === 'BLOCKED').length;
    const notTested = this.records.filter((r) => r.status === 'NOT TESTED').length;
    const inconclusive = this.records.filter((r) => r.status === 'INCONCLUSIVE').length;
    
    // As per instruction: PASS RATE = PASS / (PASS + FAIL) * 100
    const passRate = (passed + failed) > 0 ? ((passed / (passed + failed)) * 100).toFixed(1) : '100.0';

    const p0Count = this.records.filter((r) => r.status === 'FAIL' && r.severity === 'P0').length;
    const p1Count = this.records.filter((r) => r.status === 'FAIL' && r.severity === 'P1').length;
    const p2Count = this.records.filter((r) => r.status === 'FAIL' && r.severity === 'P2').length;
    const p3Count = this.records.filter((r) => r.status === 'FAIL' && r.severity === 'P3').length;

    return {
      total,
      passed,
      failed,
      blocked,
      notTested,
      inconclusive,
      passRate: `${passRate}%`,
      criticalBugs: p0Count,
      highBugs: p1Count,
      mediumBugs: p2Count,
      lowBugs: p3Count,
    };
  }
}
