import { test, expect } from '../../src/fixtures/base';
import { LoginPage } from '../../src/pages/LoginPage';
import { RegisterPage } from '../../src/pages/RegisterPage';
import { mockLoginSuccess, mockAuthError } from '../../src/utils/mock-auth-api';
import auth from '../data/auth.json';

test.describe('Login', () => {
  test('login page renders @smoke @critical', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.open();

    await expect(loginPage.title).toBeVisible();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.signInButton).toBeVisible();
    await expect(loginPage.signUpLink).toBeVisible();
  });

  test('successful login with mocked API @smoke @critical', async ({ page }) => {
    await mockLoginSuccess(page, auth.mockUser, auth.mockToken);

    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.loginWith(auth.loginCredentials.email, auth.loginCredentials.password);

    await expect(page).toHaveURL('/');
    await expect(page.getByText('Logged in successfully')).toBeVisible();
  });

  test('login form validation blocks short password @regression', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.loginWith(auth.loginCredentials.email, auth.shortPassword);

    await expect(
      page.getByText('Password must be at least 6 characters long'),
    ).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('login failure with mocked API error @regression', async ({ page }) => {
    await mockAuthError(page, 'login', auth.errorMessages.loginFailed);

    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.loginWith(auth.loginCredentials.email, auth.loginCredentials.password);

    await expect(page.getByText('Login failed')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('navigate from login to register @regression', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.goToRegister();

    await expect(page).toHaveURL('/register');
    const registerPage = new RegisterPage(page);
    await expect(registerPage.title).toBeVisible();
  });
});
