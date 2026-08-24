import { test, expect } from '../../src/fixtures/base';
import { HomePage } from '../../src/pages/HomePage';
import {
  mockProfileSuccess,
  mockProfileError,
} from '../../src/utils/mock-auth-api';
import auth from '../data/auth.json';

test.describe('Home page', () => {
  test('ping API button renders @smoke', async ({ page }) => {
    const home = new HomePage(page);
    await home.open();

    await expect(home.pingApiButton).toBeVisible();
    await expect(home.pingApiButton).toHaveText('Ping API');
  });

  test('ping API shows profile on success @smoke @critical', async ({ page }) => {
    await mockProfileSuccess(page, auth.mockUser);

    const home = new HomePage(page);
    await home.open();
    await home.pingApi();

    await expect(home.profileResult).toBeVisible();
    await expect(home.profileResult).toContainText(auth.mockUser.name);
    await expect(home.profileResult).toContainText(auth.mockUser.email);
  });

  test('ping API shows error message on failure @regression', async ({ page }) => {
    await mockProfileError(page, auth.errorMessages.loginFailed);

    const home = new HomePage(page);
    await home.open();
    await home.pingApi();

    await expect(home.profileError).toBeVisible();
    await expect(home.profileError).toContainText(auth.errorMessages.loginFailed);
  });
});
