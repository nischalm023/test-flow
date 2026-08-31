'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { TestCaseRunner } from '@/components/TestCaseRunner';
import { useTestStudio } from '@/hooks/useTestStudio';

function TestCaseRunnerPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get('id');
  const repoParam = searchParams.get('repo')?.trim() || '';
  const branchParam = searchParams.get('branch')?.trim() || '';
  const scanIdParam = searchParams.get('scanId')?.trim() || '';

  const {
    scannedPage,
    testCases,
    activeTestCase,
    toastMessage,
    handleTestComplete,
  } = useTestStudio(idParam);

  return (
    <AppShell
      activeTab="runner"
      activeTestCaseId={activeTestCase?.id}
      scannedCount={scannedPage?.elements.length || 0}
      testCasesCount={testCases.length}
      hasActiveTestToRun={!!activeTestCase}
      activeUrl={scannedPage?.url}
      toastMessage={toastMessage}
    >
      <TestCaseRunner
        testCase={activeTestCase}
        scannedElements={scannedPage?.elements || []}
        sampleKey={scannedPage?.sampleKey || 'saas-login'}
        repo={repoParam}
        branch={branchParam}
        scanId={scanIdParam}
        onBackToBuilder={() => {
          const params = new URLSearchParams();
          if (activeTestCase?.id) params.set('id', activeTestCase.id);
          if (repoParam) params.set('repo', repoParam);
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
