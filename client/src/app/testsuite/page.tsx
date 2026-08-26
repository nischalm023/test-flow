'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { TestSuiteManager } from '@/components/TestSuiteManager';
import { CodeExportModal } from '@/components/CodeExportModal';
import { useTestStudio } from '@/hooks/useTestStudio';
import { TestCase } from '@/lib/types';

export default function TestSuitePage() {
  const router = useRouter();
  const [exportModalTestCase, setExportModalTestCase] = useState<TestCase | null>(null);

  const {
    scannedPage,
    testCases,
    activeTestCase,
    toastMessage,
    setActiveTestCase,
    handleDeleteTestCase,
  } = useTestStudio();

  return (
    <AppShell
      activeTab="suite"
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
      <TestSuiteManager
        testCases={testCases}
        onSelectTestCaseToRun={(tc) => {
          setActiveTestCase(tc);
          router.push(`/testcaserunner?id=${tc.id}`);
        }}
        onEditTestCase={(tc) => {
          setActiveTestCase(tc);
          router.push(`/testcasebuilder?id=${tc.id}`);
        }}
        onCreateNewTestCase={() => router.push('/scanner')}
        onDeleteTestCase={handleDeleteTestCase}
        onOpenCodeExport={(tc) => setExportModalTestCase(tc)}
      />
    </AppShell>
  );
}
