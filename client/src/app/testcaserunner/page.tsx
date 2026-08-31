'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { TestCaseRunner } from '@/components/TestCaseRunner';
import { useTestStudio } from '@/hooks/useTestStudio';

import { useState } from 'react';
import { RepoTestCaseSelector } from '@/components/RepoTestCaseSelector';

function TestCaseRunnerPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get('id');
  const repoParam = searchParams.get('repo')?.trim() || '';
  const branchParam = searchParams.get('branch')?.trim() || '';
  const scanIdParam = searchParams.get('scanId')?.trim() || '';
  const [selectedRepo, setSelectedRepo] = useState<string>(repoParam);

  const {
    scannedPage,
    testCases,
    activeTestCase,
    toastMessage,
    setActiveTestCase,
    handleTestComplete,
  } = useTestStudio(idParam);

  return (
    <AppShell
      activeTab="runner"
      activeTestCaseId={activeTestCase?.id}
      scannedCount={scannedPage?.elements.length || 0}
      testCasesCount={testCases.length}
      hasActiveTestToRun={!!activeTestCase}
      activeUrl={activeTestCase?.targetUrl || scannedPage?.url}
      toastMessage={toastMessage}
    >
      {/* Repo & Test Case Selector Bar */}
      <RepoTestCaseSelector
        currentRepo={selectedRepo || repoParam}
        currentTestCaseId={activeTestCase?.id}
        mode="runner"
        onSelectRepo={(r) => setSelectedRepo(r)}
        onSelectTestCase={(tc, r) => {
          setActiveTestCase(tc);
          setSelectedRepo(r);
          const params = new URLSearchParams();
          params.set('id', tc.id);
          if (r) params.set('repo', r);
          if (branchParam) params.set('branch', branchParam);
          router.replace(`/testcaserunner?${params.toString()}`);
        }}
      />

      <TestCaseRunner
        testCase={activeTestCase}
        scannedElements={scannedPage?.elements || []}
        sampleKey={scannedPage?.sampleKey || 'saas-login'}
        repo={selectedRepo || repoParam}
        branch={branchParam}
        scanId={scanIdParam}
        onBackToBuilder={() => {
          const params = new URLSearchParams();
          if (activeTestCase?.id) params.set('id', activeTestCase.id);
          const r = selectedRepo || repoParam;
          if (r) params.set('repo', r);
          if (branchParam) params.set('branch', branchParam);
          router.push(`/testcasebuilder?${params.toString()}`);
        }}
        onTestComplete={handleTestComplete}
      />
    </AppShell>
  );
}

export default function TestCaseRunnerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-sm font-semibold text-slate-500">
          Loading QA Studio...
        </div>
      }
    >
      <TestCaseRunnerPageInner />
    </Suspense>
  );
}
