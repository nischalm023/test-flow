'use client';

import { AppShell } from '@/components/AppShell';
import { GithubRepoList } from '@/features/auth/components/repos';
import { useTestStudio } from '@/hooks/useTestStudio';

export default function ReposPage() {
  const { scannedPage, testCases, activeTestCase, toastMessage, scanningRepoId, handleScanRepo } =
    useTestStudio();

  return (
    <AppShell
      activeTab="repos"
      activeTestCaseId={activeTestCase?.id}
      scannedCount={scannedPage?.elements.length || 0}
      testCasesCount={testCases.length}
      hasActiveTestToRun={!!activeTestCase}
      activeUrl={scannedPage?.url}
      toastMessage={toastMessage}
    >
      <GithubRepoList onScanRepo={handleScanRepo} scanningRepoId={scanningRepoId} />
    </AppShell>
  );
}
