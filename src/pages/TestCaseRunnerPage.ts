import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class TestCaseRunnerPage extends BasePage {
  readonly statusBadge = this.page.getByTestId('run-status-badge');

  constructor(page: Page) {
    super(page);
  }

  async waitForCompletion(): Promise<void> {
    await this.statusBadge.filter({ hasText: /All Passed|Failed/ }).waitFor();
  }
}
