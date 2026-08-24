import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class RegisterPage extends BasePage {
  readonly title = this.page.getByText('Create an account', { exact: true });
  readonly nameInput = this.page.getByLabel('Name');
  readonly emailInput = this.page.getByLabel('Email');
  readonly passwordInput = this.page.getByLabel('Password', { exact: true });
  readonly confirmPasswordInput = this.page.getByLabel('Confirm Password');
  readonly createAccountButton = this.page.getByRole('button', {
    name: 'Create Account',
  });
  readonly signInLink = this.page.getByRole('link', { name: 'Sign in' });

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.goto('/register');
  }

  async fillName(name: string): Promise<void> {
    await this.nameInput.fill(name);
  }

  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
  }

  async fillPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password);
  }

  async fillConfirmPassword(password: string): Promise<void> {
    await this.confirmPasswordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.createAccountButton.click();
  }

  async registerWith(
    name: string,
    email: string,
    password: string,
    confirmPassword: string,
  ): Promise<void> {
    await this.fillName(name);
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.fillConfirmPassword(confirmPassword);
    await this.submit();
  }

  async goToLogin(): Promise<void> {
    await this.signInLink.click();
  }
}
