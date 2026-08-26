'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { TestCaseBuilder } from '@/components/TestCaseBuilder';
import { CodeExportModal } from '@/components/CodeExportModal';
import { useTestStudio } from '@/hooks/useTestStudio';
import { TestCase } from '@/lib/types';

function TestCaseBuilderPageInner() {
  const router = useRouter();
  const idParam = useSearchParams().get('id');
  const [exportModalTestCase, setExportModalTestCase] = useState<TestCase | null>(null);

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
      activeUrl={scannedPage?.url}
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
      <TestCaseBuilder
        testCase={activeTestCase}
        scannedElements={scannedPage?.elements || []}
        onSaveTestCase={handleSaveTestCase}
        onStartTestCaseRun={(tc) => {
          setActiveTestCase(tc);
          router.push(`/testcaserunner?id=${tc.id}`);
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
