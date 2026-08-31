import type { Page } from '@playwright/test';

export interface GithubRepoMock {
  id: number;
  name: string;
  full_name?: string;
  html_url: string;
  description: string | null;
  private: boolean;
  stargazers_count: number;
}

export interface GithubUserMock {
  id: string;
  name: string;
  email: string;
  role: string;
  githubLogin?: string;
}

export interface BranchMock {
  branches: string[];
  defaultBranch?: string;
}

export async function seedGithubAuth(
  page: Page,
  user: GithubUserMock,
  accessToken: string,
): Promise<void> {
  const payload = JSON.stringify({
    state: {
      user,
      accessToken,
      isAuthenticated: true,
    },
    version: 0,
  });

  await page.addInitScript((storageValue) => {
    localStorage.setItem('auth-storage', storageValue);
  }, payload);
}

export async function clearAuthStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem('auth-storage');
    localStorage.removeItem('accessToken');
  });
}

export async function mockGithubReposSuccess(
  page: Page,
  repos: GithubRepoMock[],
  options?: { delayMs?: number },
): Promise<void> {
  await page.route('**/api/github/repos', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    if (options?.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ repos }),
    });
  });
}

export async function mockGithubReposError(page: Page, status = 502): Promise<void> {
  await page.route('**/api/github/repos', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ repos: [] }),
    });
  });
}

export async function mockGithubReposPending(page: Page): Promise<void> {
  await page.route('**/api/github/repos', async () => {
    // Intentionally never fulfilled to keep the query in pending state.
  });
}

export async function mockGithubBranchesSuccess(
  page: Page,
  branchesByRepo: Record<string, BranchMock>,
): Promise<void> {
  await page.route('**/api/github/branch?**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    const url = new URL(route.request().url());
    const repo = url.searchParams.get('repo') ?? '';
    const branchData = branchesByRepo[repo] ?? { branches: ['main'], defaultBranch: 'main' };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(branchData),
    });
  });
}

export async function mockGithubBranchesWithCounter(
  page: Page,
  branchesByRepo: Record<string, BranchMock>,
  onRequest: () => void,
): Promise<void> {
  await page.route('**/api/github/branch?**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    onRequest();

    const url = new URL(route.request().url());
    const repo = url.searchParams.get('repo') ?? '';
    const branchData = branchesByRepo[repo] ?? { branches: ['main'], defaultBranch: 'main' };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(branchData),
    });
  });
}

export async function mockGithubReposAndBranches(
  page: Page,
  repos: GithubRepoMock[],
  branchesByRepo: Record<string, BranchMock>,
  options?: { reposDelayMs?: number },
): Promise<void> {
  await mockGithubReposSuccess(page, repos, { delayMs: options?.reposDelayMs });
  await mockGithubBranchesSuccess(page, branchesByRepo);
}
