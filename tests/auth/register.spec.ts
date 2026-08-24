import { test, expect } from '../../src/fixtures/base';
import { LoginPage } from '../../src/pages/LoginPage';
import { RegisterPage } from '../../src/pages/RegisterPage';
import { mockRegisterSuccess, mockAuthError } from '../../src/utils/mock-auth-api';
import auth from '../data/auth.json';

test.describe('Register', () => {
  test('register page renders @smoke @critical', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.open();

    await expect(registerPage.title).toBeVisible();
    await expect(registerPage.nameInput).toBeVisible();
    await expect(registerPage.emailInput).toBeVisible();
    await expect(registerPage.passwordInput).toBeVisible();
    await expect(registerPage.confirmPasswordInput).toBeVisible();
    await expect(registerPage.createAccountButton).toBeVisible();
    await expect(registerPage.signInLink).toBeVisible();
  });

  test('successful registration with mocked API @smoke @critical', async ({ page }) => {
    await mockRegisterSuccess(page, auth.mockUser);

    const registerPage = new RegisterPage(page);
    await registerPage.open();
    await registerPage.registerWith(
      auth.registerCredentials.name,
      auth.registerCredentials.email,
      auth.registerCredentials.password,
      auth.registerCredentials.confirmPassword,
    );

    await expect(page).toHaveURL('/login');
    await expect(page.getByText('Registered successfully')).toBeVisible();
  });

  test('register form validation blocks password mismatch @regression', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.open();
    await registerPage.registerWith(
      auth.registerCredentials.name,
      auth.registerCredentials.email,
      auth.registerCredentials.password,
      auth.mismatchedConfirmPassword,
    );

    await expect(page.getByText('Passwords do not match')).toBeVisible();
    await expect(page).toHaveURL('/register');
  });

  test('register failure with mocked API error @regression', async ({ page }) => {
    await mockAuthError(page, 'register', auth.errorMessages.registerFailed, 409);

    const registerPage = new RegisterPage(page);
    await registerPage.open();
    await registerPage.registerWith(
      auth.registerCredentials.name,
      auth.registerCredentials.email,
      auth.registerCredentials.password,
      auth.registerCredentials.confirmPassword,
    );

    await expect(page.getByText('Registration failed')).toBeVisible();
    await expect(page).toHaveURL('/register');
  });

  test('navigate from register to login @regression', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.open();
    await registerPage.goToLogin();

    await expect(page).toHaveURL('/login');
    const loginPage = new LoginPage(page);
    await expect(loginPage.title).toBeVisible();
  });
});
