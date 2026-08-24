import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  readonly title = this.page.getByText('Welcome back', { exact: true });
  readonly emailInput = this.page.getByLabel('Email');
  readonly passwordInput = this.page.getByLabel('Password');
  readonly signInButton = this.page.getByRole('button', { name: 'Sign In' });
  readonly signUpLink = this.page.getByRole('link', { name: 'Sign up' });

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.goto('/login');
  }

  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
  }

  async fillPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.signInButton.click();
  }

  async loginWith(email: string, password: string): Promise<void> {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
  }

  async goToRegister(): Promise<void> {
    await this.signUpLink.click();
  }
}
