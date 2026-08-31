import type { TestCase, TestCaseStep } from '@/lib/types';

function escapeQuotes(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function kebab(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}

/** A navigate step's value is often a relative path guessed by the AI (e.g. '/login').
 * Resolve it against the live app's targetUrl so generated code always gets a real, absolute URL. */
export function resolveNavigateUrl(value: string | undefined, targetUrl: string): string {
  const trimmed = value?.trim();
  const base = targetUrl?.trim() ?? '';
  if (!trimmed) return base;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!base) return trimmed;
  try {
    return new URL(trimmed, base.endsWith('/') ? base : `${base}/`).toString();
  } catch {
    return trimmed;
  }
}

/** Stamp the live client URL onto a test case and fill empty `navigate` steps. */
export function applyLiveAppUrl(tc: TestCase, liveUrl: string): TestCase {
  const targetUrl = liveUrl.trim() || tc.targetUrl?.trim() || '';
  const steps = tc.steps.map((step) => {
    if (step.action !== 'navigate') return step;
    return { ...step, value: resolveNavigateUrl(step.value, targetUrl) };
  });
  if (targetUrl && !steps.some((step) => step.action === 'navigate')) {
    steps.unshift({
      id: `step-nav-${Date.now()}`,
      order: 0,
      action: 'navigate',
      targetSelector: 'window',
      targetDescription: 'Navigate to the app',
      value: targetUrl,
      timeoutMs: 1000,
    });
  }
  return { ...tc, targetUrl, steps };
}

/** Extracted from CodeExportModal's generatePlaywrightCode — same per-step comment + action mapping. */
export function stepsToPlaywrightBody(steps: TestCaseStep[], targetUrl: string): string {
  return steps
    .map((step, i) => {
      switch (step.action) {
        case 'navigate':
          return `    // Step ${i + 1}: Navigate to target page\n    await page.goto('${resolveNavigateUrl(step.value, targetUrl) || '/'}');`;
        case 'click':
          return `    // Step ${i + 1}: Click ${step.targetDescription || step.targetSelector}\n    await page.locator('${step.targetSelector}').click();`;
        case 'type':
          return `    // Step ${i + 1}: Enter text in ${step.targetDescription || step.targetSelector}\n    await page.locator('${step.targetSelector}').fill('${step.value || ''}');`;
        case 'select':
          return `    // Step ${i + 1}: Select option\n    await page.locator('${step.targetSelector}').selectOption('${step.value || ''}');`;
        case 'assert_visible':
          return `    // Step ${i + 1}: Assert visible: ${step.targetDescription || step.targetSelector}\n    await expect(page.locator('${step.targetSelector}')).toBeVisible({ timeout: ${step.timeoutMs} });`;
        case 'assert_text':
          return `    // Step ${i + 1}: Assert text content\n    await expect(page.locator('${step.targetSelector}')).toContainText('${step.expectedValue || ''}');`;
        case 'assert_value':
          return `    // Step ${i + 1}: Assert input value\n    await expect(page.locator('${step.targetSelector}')).toHaveValue('${step.expectedValue || ''}');`;
        case 'wait':
          return `    // Step ${i + 1}: Wait delay\n    await page.waitForTimeout(${step.timeoutMs});`;
        case 'screenshot':
          return `    // Step ${i + 1}: Capture screenshot\n    await page.screenshot({ path: 'screenshots/step-${i + 1}.png' });`;
        default:
          return `    // Step ${i + 1}: Action ${step.action}\n    await page.locator('${step.targetSelector}').hover();`;
      }
    })
    .join('\n\n');
}

function stepActionStatement(step: TestCaseStep, targetUrl: string): string {
  switch (step.action) {
    case 'navigate':
      return `await page.goto('${escapeQuotes(resolveNavigateUrl(step.value, targetUrl) || '/')}');`;
    case 'click':
      return `await page.locator('${escapeQuotes(step.targetSelector)}').click();`;
    case 'type':
      return `await page.locator('${escapeQuotes(step.targetSelector)}').fill('${escapeQuotes(step.value || '')}');`;
    case 'select':
      return `await page.locator('${escapeQuotes(step.targetSelector)}').selectOption('${escapeQuotes(step.value || '')}');`;
    case 'assert_visible':
      return `await expect(page.locator('${escapeQuotes(step.targetSelector)}')).toBeVisible({ timeout: ${step.timeoutMs} });`;
    case 'assert_text':
      return `await expect(page.locator('${escapeQuotes(step.targetSelector)}')).toContainText('${escapeQuotes(step.expectedValue || '')}');`;
    case 'assert_value':
      return `await expect(page.locator('${escapeQuotes(step.targetSelector)}')).toHaveValue('${escapeQuotes(step.expectedValue || '')}');`;
    case 'wait':
      return `await page.waitForTimeout(${step.timeoutMs});`;
    case 'hover':
      return `await page.locator('${escapeQuotes(step.targetSelector)}').hover();`;
    case 'scroll':
      return `await page.locator('${escapeQuotes(step.targetSelector)}').scrollIntoViewIfNeeded();`;
    case 'screenshot':
      return `await page.screenshot();`;
    default:
      return `await page.locator('${escapeQuotes(step.targetSelector)}').hover();`;
  }
}

function priorityTag(priority: TestCase['priority']): string {
  if (priority === 'critical') return '@critical';
  if (priority === 'high') return '@smoke';
  return '@regression';
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export function buildSpecFile(tc: TestCase, fixtureImportPath: string): GeneratedFile {
  const resolved = applyLiveAppUrl(tc, tc.targetUrl);
  const tag = priorityTag(resolved.priority);
  const useSteps = resolved.steps.length > 3;

  const body = resolved.steps
    .map((step) => {
      const label = escapeQuotes(step.targetDescription || `${step.action} ${step.targetSelector}`);
      const action = stepActionStatement(step, resolved.targetUrl);
      if (useSteps) {
        return `    await test.step('${label}', async () => {\n      ${action}\n    });`;
      }
      return `    ${action}`;
    })
    .join('\n\n');

  const content = `import { test, expect } from '${fixtureImportPath}';

test.describe('${escapeQuotes(tc.category)}: ${escapeQuotes(tc.title)}', () => {
  test('${escapeQuotes(tc.title)} ${tag}', async ({ page }) => {
${body}
  });
});
`;

  return { path: `tests/${kebab(tc.category)}/${kebab(tc.title)}.spec.ts`, content };
}

export function buildBaseFixture(): GeneratedFile {
  return {
    path: 'src/fixtures/base.ts',
    content: `import { test as base, expect } from '@playwright/test';

export const test = base;
export { expect };
`,
  };
}

export function buildBasePage(): GeneratedFile {
  return {
    path: 'src/pages/BasePage.ts',
    content: `import type { Page } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }
}
`,
  };
}

export function buildPlaywrightConfig(baseUrl: string): GeneratedFile {
  return {
    path: 'playwright.config.ts',
    content: `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: '${baseUrl}',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
`,
  };
}

export function buildTestFiles(testCases: TestCase[], baseUrl: string): GeneratedFile[] {
  const fixtureImportPath = '../../src/fixtures/base';
  return [
    buildBaseFixture(),
    buildBasePage(),
    buildPlaywrightConfig(baseUrl),
    ...testCases.map((tc) => buildSpecFile(tc, fixtureImportPath)),
  ];
}
