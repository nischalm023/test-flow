'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { TestCaseBuilder } from '@/components/TestCaseBuilder';
import { CodeExportModal } from '@/components/CodeExportModal';
import { ProjectRunnerPanel } from '@/components/ProjectRunnerPanel';
import { useTestStudio } from '@/hooks/useTestStudio';
import { TestCase } from '@/lib/types';

import { RepoTestCaseSelector } from '@/components/RepoTestCaseSelector';

function TestCaseBuilderPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get('id');
  const repoParam = searchParams.get('repo')?.trim() || '';
  const branchParam = searchParams.get('branch')?.trim() || '';
  const scanIdParam = searchParams.get('scanId')?.trim() || '';
  const [exportModalTestCase, setExportModalTestCase] = useState<TestCase | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string>(repoParam);

  const {
    scannedPage,
    testCases,
    activeTestCase,
    toastMessage,
    handleSaveTestCase,
    setActiveTestCase,
  } = useTestStudio(idParam);

  return (
    <AppShell
      activeTab="builder"
      activeTestCaseId={activeTestCase?.id}
      scannedCount={scannedPage?.elements.length || 0}
      testCasesCount={testCases.length}
      hasActiveTestToRun={!!activeTestCase}
      activeUrl={activeTestCase?.targetUrl || scannedPage?.url}
      toastMessage={toastMessage}
      overlay={
        exportModalTestCase && (
          <CodeExportModal
            testCase={exportModalTestCase}
            onClose={() => setExportModalTestCase(null)}
          />
        )
      }
    >
      {repoParam.includes('/') && branchParam && (
        <ProjectRunnerPanel repo={repoParam} branch={branchParam} />
      )}

      {/* Repo & Test Case Selector Bar */}
      <RepoTestCaseSelector
        currentRepo={selectedRepo || repoParam}
        currentTestCaseId={activeTestCase?.id}
        mode="builder"
        onSelectRepo={(r) => setSelectedRepo(r)}
        onSelectTestCase={(tc, r) => {
          setActiveTestCase(tc);
          setSelectedRepo(r);
          const params = new URLSearchParams();
          params.set('id', tc.id);
          if (r) params.set('repo', r);
          if (branchParam) params.set('branch', branchParam);
          router.replace(`/testcasebuilder?${params.toString()}`);
        }}
      />

      <TestCaseBuilder
        testCase={activeTestCase}
        scannedElements={scannedPage?.elements || []}
        onSaveTestCase={handleSaveTestCase}
        onStartTestCaseRun={async (tc) => {
          setActiveTestCase(tc);

          // Call GET /api/github/run to fetch run status / initiate run state
          try {
            const res = await fetch('/api/github/run');
            const data = await res.json();
            console.log('[TestCaseBuilder] 🚀 Called GET /api/github/run:', data);
          } catch (err) {
            console.warn('[TestCaseBuilder] ⚠️ GET /api/github/run failed:', err);
          }

          const params = new URLSearchParams();
          params.set('id', tc.id);
          const r = selectedRepo || repoParam;
          if (r) params.set('repo', r);
          if (branchParam) params.set('branch', branchParam);
          if (scanIdParam) params.set('scanId', scanIdParam);
          router.push(`/testcaserunner?${params.toString()}`);
        }}
        onOpenCodeExport={(tc) => setExportModalTestCase(tc)}
        onCancel={() => router.push('/scanner')}
      />
    </AppShell>
  );
}

export default function TestCaseBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-sm font-semibold text-slate-500">
          Loading QA Studio...
        </div>
      }
    >
      <TestCaseBuilderPageInner />
    </Suspense>
  );
}
