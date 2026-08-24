import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
  readonly pingApiButton = this.page.getByTestId('ping-api-btn');
  readonly profileResult = this.page.getByTestId('profile-result');
  readonly profileError = this.page.getByTestId('profile-error');

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.goto('/');
  }

  async pingApi(): Promise<void> {
    await this.pingApiButton.click();
  }
}
