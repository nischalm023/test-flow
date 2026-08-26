'use client';

import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageScanner } from '@/components/PageScanner';
import { useTestStudio } from '@/hooks/useTestStudio';

export default function ScannerPage() {
  const router = useRouter();
  const {
    scannedPage,
    testCases,
    activeTestCase,
    isScanning,
    isGeneratingAi,
    toastMessage,
    handleSelectSamplePage,
    handleScanPage,
    handleCreateTestCaseFromScan,
    handleAutoGenerateTestCases,
  } = useTestStudio();

  return (
    <AppShell
      activeTab="scanner"
      activeTestCaseId={activeTestCase?.id}
      scannedCount={scannedPage?.elements.length || 0}
      testCasesCount={testCases.length}
      hasActiveTestToRun={!!activeTestCase}
      activeUrl={scannedPage?.url}
      toastMessage={toastMessage}
    >
      <PageScanner
        scannedPage={scannedPage}
        onScanPage={handleScanPage}
        onCreateTestCaseFromScan={(el) => {
          const tc = handleCreateTestCaseFromScan(el);
          router.push(`/testcasebuilder?id=${tc.id}`);
        }}
        onAutoGenerateTestCases={async (prompt, category) => {
          await handleAutoGenerateTestCases(prompt, category);
          router.push('/testsuite');
        }}
        onSelectSamplePage={handleSelectSamplePage}
        isScanning={isScanning}
        isGeneratingAi={isGeneratingAi}
      />
    </AppShell>
  );
}
