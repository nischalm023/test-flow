'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { TestSuiteManager } from '@/components/TestSuiteManager';
import { RepoTestCaseExplorer } from '@/components/RepoTestCaseExplorer';
import { CodeExportModal } from '@/components/CodeExportModal';
import { useTestStudio } from '@/hooks/useTestStudio';
import { TestCase } from '@/lib/types';
import { Database, Layers } from 'lucide-react';

export default function TestSuitePage() {
  const router = useRouter();
  const [exportModalTestCase, setExportModalTestCase] = useState<TestCase | null>(null);
  const [viewMode, setViewMode] = useState<'qdrant-redis' | 'active-suite'>('qdrant-redis');

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
      <div className="space-y-6">
        {/* View Mode Toggle Header */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl w-fit">
            <button
              onClick={() => setViewMode('qdrant-redis')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'qdrant-redis'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-blue-600" />
              <span>Repositories</span>
            </button>

            <button
              onClick={() => setViewMode('active-suite')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'active-suite'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>Local Session Suite ({testCases.length})</span>
            </button>
          </div>
        </div>

        {viewMode === 'qdrant-redis' ? (
          <RepoTestCaseExplorer
            onSelectTestCaseToRun={(tc, repo) => {
              setActiveTestCase(tc);
              const params = new URLSearchParams();
              params.set('id', tc.id);
              if (repo) params.set('repo', repo);
              router.push(`/testcaserunner?${params.toString()}`);
            }}
            onSelectTestCaseToEdit={(tc, repo) => {
              setActiveTestCase(tc);
              const params = new URLSearchParams();
              params.set('id', tc.id);
              if (repo) params.set('repo', repo);
              router.push(`/testcasebuilder?${params.toString()}`);
            }}
            onOpenCodeExport={(tc) => setExportModalTestCase(tc)}
          />
        ) : (
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
        )}
      </div>
    </AppShell>
  );
}
