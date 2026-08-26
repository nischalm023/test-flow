import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class TestSuitePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.goto('/testsuite');
  }

  runTestButton(testCaseId: string) {
    return this.page.getByTestId(`run-test-${testCaseId}`);
  }

  async runTestCase(testCaseId: string): Promise<void> {
    await this.runTestButton(testCaseId).click();
  }
}
