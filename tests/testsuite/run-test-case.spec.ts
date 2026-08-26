import { test, expect } from '../../src/fixtures/base';
import { TestSuitePage } from '../../src/pages/TestSuitePage';
import { TestCaseRunnerPage } from '../../src/pages/TestCaseRunnerPage';

const PRESET_TEST_CASE_ID = 'tc-preset-login-happy';

test.describe('Test Suite - Run Test Case', () => {
  test('clicking Run Test on a test case runs it to completion @smoke @regression', async ({ page }) => {
    const suite = new TestSuitePage(page);
    await suite.open();
    await suite.runTestCase(PRESET_TEST_CASE_ID);

    await expect(page).toHaveURL(new RegExp(`/testcaserunner\\?id=${PRESET_TEST_CASE_ID}`));

    const runner = new TestCaseRunnerPage(page);
    await runner.waitForCompletion();
    await expect(runner.statusBadge).toHaveText('✓ All Passed');
  });
});
