import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class ReposPage extends BasePage {
  readonly githubNotConnectedTitle = this.page.getByText('GitHub not connected', { exact: true });
  readonly githubNotConnectedDescription = this.page.getByText(
    'Sign in with GitHub to view and manage your repositories.',
    { exact: true },
  );
  readonly loadingMessage = this.page.getByText('Loading repositories…', { exact: true });
  readonly errorMessage = this.page.getByText(
    'Could not load repositories. Sign in with GitHub again.',
    { exact: true },
  );
  readonly emptyMessage = this.page.getByText('No repositories found.', { exact: true });
  readonly repositoriesHeading = this.page.getByRole('heading', {
    name: 'Your repositories',
    exact: true,
  });

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.goto('/repos');
  }

  repoCard(repoName: string): Locator {
    return this.page
      .locator('[data-slot="card"]')
      .filter({
        has: this.page.locator('[data-slot="card-title"]').getByText(repoName, { exact: true }),
      })
      .first();
  }

  githubLoginLabel(login: string): Locator {
    return this.page.getByText(new RegExp(`@${login}(\\s|$)`));
  }

  repoDescription(description: string): Locator {
    return this.page.getByText(description, { exact: true });
  }

  repoStarCount(repoName: string, count: number): Locator {
    return this.repoCard(repoName).getByText(String(count), { exact: true });
  }

  repoFullNameLink(fullName: string): Locator {
    return this.page.getByRole('link', { name: fullName });
  }

  branchSelect(repoName: string): Locator {
    return this.repoCard(repoName).getByRole('combobox');
  }

  refreshBranchesButton(repoName: string): Locator {
    return this.repoCard(repoName).getByTitle('Refresh branches');
  }

  scanButton(repoName: string): Locator {
    return this.repoCard(repoName).getByRole('button', { name: 'Scan' });
  }

  createTestButton(repoName: string): Locator {
    return this.repoCard(repoName).getByRole('button', { name: 'Create Test' });
  }

  async selectBranch(repoName: string, branch: string): Promise<void> {
    await this.branchSelect(repoName).selectOption(branch);
  }

  async clickScan(repoName: string): Promise<void> {
    await this.scanButton(repoName).click();
  }

  async clickCreateTest(repoName: string): Promise<void> {
    await this.createTestButton(repoName).click();
  }

  async clickRefreshBranches(repoName: string): Promise<void> {
    await this.refreshBranchesButton(repoName).click();
  }
}
