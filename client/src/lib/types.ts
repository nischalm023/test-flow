export type ElementCategory = 'action' | 'input' | 'container' | 'navigation' | 'content' | 'other';

export interface ScannedElement {
  id: string;
  tag: string;
  type: string;
  name: string;
  text?: string;
  selector: string;
  xpath?: string;
  placeholder?: string;
  value?: string;
  role?: string;
  isInteractive: boolean;
  category: ElementCategory;
  required?: boolean;
  href?: string;
  options?: string[];
  attributes?: Record<string, string | undefined>;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface LiveTestState {
  loginAuthenticated?: boolean;
  ticketSubmitted?: boolean;
  flightSearched?: boolean;
  formData?: Record<string, string>;
  validationErrors?: Record<string, string>;
  [key: string]: any;
}

export interface ScannedPage {
  url: string;
  title: string;
  description: string;
  scannedAt: string;
  elements: ScannedElement[];
  counts: {
    total: number;
    buttons: number;
    inputs: number;
    forms: number;
    links: number;
    headings: number;
  };
  rawHtml?: string;
  sampleKey?: string;
}

export type StepAction =
  | 'click'
  | 'type'
  | 'select'
  | 'assert_visible'
  | 'assert_text'
  | 'assert_value'
  | 'wait'
  | 'hover'
  | 'scroll'
  | 'screenshot'
  | 'navigate';

export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface TestCaseStep {
  id: string;
  order: number;
  action: StepAction;
  targetSelector: string;
  targetDescription: string;
  value?: string;
  expectedValue?: string;
  timeoutMs: number;
  status?: StepStatus;
  executionTimeMs?: number;
  errorMessage?: string;
  actualValue?: string;
  screenshot?: string;
}

export type TestPriority = 'critical' | 'high' | 'medium' | 'low';
export type TestCategory = 'Functional' | 'Smoke' | 'E2E' | 'Negative / Edge Case' | 'Accessibility' | 'Security' | 'Performance';
export type TestCaseStatus = 'draft' | 'ready' | 'running' | 'passed' | 'failed';

export interface TestCase {
  id: string;
  title: string;
  description: string;
  priority: TestPriority;
  category: TestCategory;
  status: TestCaseStatus;
  targetUrl: string;
  steps: TestCaseStep[];
  createdAt: string;
  lastRunAt?: string;
  executionStats?: {
    durationMs: number;
    passedSteps: number;
    totalSteps: number;
    passRate: number;
  };
}

export interface ExecutionLog {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  stepId?: string;
  details?: any;
}

export interface SampleInteractivePage {
  id: string;
  name: string;
  category: string;
  description: string;
  badge: string;
  defaultUrl: string;
  elements: ScannedElement[];
  htmlSnippet: string;
}
