import type { Page } from '@playwright/test';

export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

function successBody(data: unknown) {
  return JSON.stringify({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      path: '/auth',
      method: 'POST',
    },
  });
}

function errorBody(message: string) {
  return JSON.stringify({
    success: false,
    error: {
      code: 'AUTH_ERROR',
      message,
      timestamp: new Date().toISOString(),
      path: '/auth',
    },
  });
}

export async function mockLoginSuccess(
  page: Page,
  user: MockUser,
  accessToken: string,
): Promise<void> {
  await page.route('**/auth/login', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: successBody({ access_token: accessToken, user }),
    });
  });
}

export async function mockRegisterSuccess(
  page: Page,
  user: MockUser,
): Promise<void> {
  await page.route('**/auth/register', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: successBody(user),
    });
  });
}

export async function mockAuthError(
  page: Page,
  endpoint: 'login' | 'register',
  message: string,
  status = 401,
): Promise<void> {
  await page.route(`**/auth/${endpoint}`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: errorBody(message),
    });
  });
}

export async function mockProfileSuccess(
  page: Page,
  user: MockUser,
): Promise<void> {
  await page.route('**/auth/profile', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: successBody(user),
    });
  });
}

export async function mockProfileError(
  page: Page,
  message: string,
  status = 401,
): Promise<void> {
  await page.route('**/auth/profile', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: errorBody(message),
    });
  });
}
