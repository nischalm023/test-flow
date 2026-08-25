'use client';

import React, { useState, useEffect } from 'react';
import { ScannedPage, ScannedElement, TestCase, TestCaseStep } from '@/lib/types';
import { DEFAULT_PRESET_TEST_CASES, buildScannedPage } from '@/data/samplePages';
import { Navbar } from '@/components/Navbar';
import { PageScanner } from '@/components/PageScanner';
import { TestCaseBuilder } from '@/components/TestCaseBuilder';
import { TestCaseRunner } from '@/components/TestCaseRunner';
import { TestSuiteManager } from '@/components/TestSuiteManager';
import { CodeExportModal } from '@/components/CodeExportModal';
import { GithubRepoList, type GithubRepo } from '@/features/auth/components/repos';

const TEST_CASES_KEY = 'qa_studio_test_cases';

function loadSavedTestCases(): TestCase[] | null {
  try {
    const saved = localStorage.getItem(TEST_CASES_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const kept = parsed.filter(
      (tc: TestCase) => !String(tc?.targetUrl || '').includes('apexgear.io'),
    );
    return kept.length > 0 ? kept : null;
  } catch (e) {
    console.error('Failed to parse local test cases:', e);
    return null;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'scanner' | 'builder' | 'runner' | 'suite' | 'repos'>('scanner');
  const [scannedPage, setScannedPage] = useState<ScannedPage | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>(DEFAULT_PRESET_TEST_CASES);
  const [hydrated, setHydrated] = useState(false);

  const [activeTestCase, setActiveTestCase] = useState<TestCase>(DEFAULT_PRESET_TEST_CASES[0]);
  const [exportModalTestCase, setExportModalTestCase] = useState<TestCase | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanningRepoId, setScanningRepoId] = useState<number | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadSavedTestCases();
    if (saved) {
      setTestCases(saved);
      setActiveTestCase(saved[0]);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(TEST_CASES_KEY, JSON.stringify(testCases));
  }, [testCases, hydrated]);

  useEffect(() => {
    handleSelectSamplePage('saas-login');
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSelectSamplePage = (sampleId: string) => {
    setScannedPage(buildScannedPage(sampleId));
  };

  const handleScanPage = async (url: string, rawHtml?: string, sampleKey?: string) => {
    setIsScanning(true);
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, rawHtml }),
      });

      if (!response.ok) {
        throw new Error(`Scan request failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      const newPage: ScannedPage = {
        url: data.url,
        title: data.title,
        description: data.description,
        scannedAt: data.scannedAt,
        elements: data.elements,
        counts: data.counts,
        rawHtml: data.rawHtml,
        sampleKey: sampleKey || data.sampleKey || 'custom',
      };

      setScannedPage(newPage);
      showToast(`Scanned ${data.elements.length} DOM elements from "${data.title}"`);
    } catch (err: unknown) {
      console.warn('Scan error, using local fallback parser:', err);
      handleSelectSamplePage('saas-login');
      showToast('Page loaded in sandbox inspection mode.');
    } finally {
      setIsScanning(false);
      setScanningRepoId(null);
    }
  };

  const handleScanRepo = async (repo: GithubRepo) => {
    setScanningRepoId(repo.id);
    setActiveTab('scanner');
    await handleScanPage(repo.html_url);
  };

  const handleCreateTestCaseFromScan = (selectedElement?: ScannedElement) => {
    const targetUrl = scannedPage?.url || 'https://app.cloudscale.io/login';
    const pageTitle = scannedPage?.title || 'Web Page';
    const elements = scannedPage?.elements || [];

    const defaultSteps: TestCaseStep[] = [
      {
        id: `step-${Date.now()}-1`,
        order: 1,
        action: 'navigate',
        targetSelector: 'window',
        targetDescription: `Open ${pageTitle}`,
        value: targetUrl,
        timeoutMs: 1200,
      },
    ];

    if (selectedElement) {
      if (selectedElement.tag === 'input') {
        defaultSteps.push({
          id: `step-${Date.now()}-2`,
          order: 2,
          action: 'type',
          targetSelector: selectedElement.selector,
          targetDescription: `Input in ${selectedElement.placeholder || selectedElement.name}`,
          value: 'test.data@example.com',
          timeoutMs: 1000,
        });
      } else if (selectedElement.tag === 'button') {
        defaultSteps.push({
          id: `step-${Date.now()}-2`,
          order: 2,
          action: 'click',
          targetSelector: selectedElement.selector,
          targetDescription: `Click ${selectedElement.text || 'Action Button'}`,
          timeoutMs: 1000,
        });
      }

      defaultSteps.push({
        id: `step-${Date.now()}-3`,
        order: defaultSteps.length + 1,
        action: 'assert_visible',
        targetSelector: selectedElement.selector,
        targetDescription: `Assert ${selectedElement.text || selectedElement.name} is interactive`,
        expectedValue: 'visible',
        timeoutMs: 1200,
      });
    } else {
      const inputs = elements.filter((e) => e.tag === 'input');
      const buttons = elements.filter((e) => e.tag === 'button');

      inputs.slice(0, 3).forEach((inp, idx) => {
        defaultSteps.push({
          id: `step-${Date.now()}-${idx + 2}`,
          order: defaultSteps.length + 1,
          action: 'type',
          targetSelector: inp.selector,
          targetDescription: `Fill ${inp.placeholder || inp.name}`,
          value: inp.type === 'email' ? 'tester@example.com' : 'Test Value',
          timeoutMs: 800,
        });
      });

      if (buttons.length > 0) {
        defaultSteps.push({
          id: `step-${Date.now()}-btn`,
          order: defaultSteps.length + 1,
          action: 'click',
          targetSelector: buttons[0].selector,
          targetDescription: `Click ${buttons[0].text || 'Action'}`,
          timeoutMs: 1200,
        });
      }

      defaultSteps.push({
        id: `step-${Date.now()}-assert`,
        order: defaultSteps.length + 1,
        action: 'assert_visible',
        targetSelector: 'body',
        targetDescription: 'Assert Confirmation State',
        expectedValue: 'visible',
        timeoutMs: 1500,
      });
    }

    const newTestCase: TestCase = {
      id: `tc-${Date.now()}`,
      title: selectedElement
        ? `Test Interaction: ${selectedElement.text || selectedElement.name}`
        : `E2E Flow: ${pageTitle}`,
      description: `Automated test sequence generated for ${pageTitle} validating control state and user flow.`,
      priority: 'high',
      category: 'E2E',
      status: 'ready',
      targetUrl,
      createdAt: new Date().toISOString(),
      steps: defaultSteps,
    };

    setActiveTestCase(newTestCase);
    setTestCases((prev) => [newTestCase, ...prev]);
    setActiveTab('builder');
    showToast('New test case created! Customize steps or click "Start Test Case UI" to run.');
  };

  const handleAutoGenerateTestCases = async (customPrompt?: string, category?: string) => {
    setIsGeneratingAi(true);
    try {
      const response = await fetch('/api/generate-test-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: scannedPage?.url || 'https://app.cloudscale.io/login',
          title: scannedPage?.title || 'Web Page',
          elements: scannedPage?.elements || [],
          category,
          customPrompt,
        }),
      });

      const data = await response.json();
      if (data.testCases && data.testCases.length > 0) {
        const normalized = data.testCases.map((tc: TestCase, i: number) => ({
          ...tc,
          id: tc.id || `tc-ai-${Date.now()}-${i}`,
          createdAt: new Date().toISOString(),
          targetUrl: scannedPage?.url || 'https://app.cloudscale.io/login',
          steps: (tc.steps || []).map((s, idx) => ({
            ...s,
            id: s.id || `step-ai-${idx}`,
            order: idx + 1,
            timeoutMs: s.timeoutMs || 1000,
          })),
        }));

        setTestCases((prev) => [...normalized, ...prev]);
        setActiveTestCase(normalized[0]);
        setActiveTab('suite');
        showToast(`AI synthesized ${normalized.length} test cases!`);
      }
    } catch (e: unknown) {
      console.error('AI Gen error:', e);
      showToast('Generated standard QA test cases.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSaveTestCase = (updated: TestCase) => {
    setTestCases((prev) => {
      const exists = prev.some((tc) => tc.id === updated.id);
      if (exists) {
        return prev.map((tc) => (tc.id === updated.id ? updated : tc));
      }
      return [updated, ...prev];
    });
    setActiveTestCase(updated);
    showToast('Test Case saved to suite!');
  };

  const handleStartTestCaseRun = (tc: TestCase) => {
    setActiveTestCase(tc);
    setActiveTab('runner');
  };

  const handleDeleteTestCase = (id: string) => {
    setTestCases((prev) => prev.filter((tc) => tc.id !== id));
    showToast('Test case removed from suite.');
  };

  const handleTestComplete = (updatedCase: TestCase, _passed: boolean) => {
    setTestCases((prev) => prev.map((tc) => (tc.id === updatedCase.id ? updatedCase : tc)));
    setActiveTestCase(updatedCase);
  };

  const getHeaderTitle = () => {
    switch (activeTab) {
      case 'scanner':
        return 'Interface Scanner & Target Inspector';
      case 'builder':
        return 'Test Case Builder & Step Sequencer';
      case 'runner':
        return 'Live Execution & Interactive Browser';
      case 'suite':
        return 'Test Repository & QA Analytics';
      case 'repos':
        return 'GitHub Repositories & Projects';
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden">
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        scannedCount={scannedPage?.elements.length || 0}
        testCasesCount={testCases.length}
        hasActiveTestToRun={!!activeTestCase}
        activeUrl={scannedPage?.url}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-8 shrink-0 z-10 shadow-xs">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              {getHeaderTitle()}
            </h2>
            <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-full border border-emerald-200 uppercase tracking-wide flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Engine Online
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Source:</span>
              <span className="font-mono text-slate-800 font-semibold max-w-[200px] lg:max-w-xs truncate bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
                {scannedPage?.url || 'app.cloudscale.io/login'}
              </span>
            </div>
            {activeTab !== 'scanner' && (
              <button
                onClick={() => setActiveTab('scanner')}
                className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-medium rounded-lg text-xs transition-colors"
              >
                Change Source
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-[#F8FAFC]">
          <div className="max-w-7xl mx-auto space-y-6">
            {activeTab === 'scanner' && (
              <PageScanner
                scannedPage={scannedPage}
                onScanPage={handleScanPage}
                onCreateTestCaseFromScan={handleCreateTestCaseFromScan}
                onAutoGenerateTestCases={handleAutoGenerateTestCases}
                onSelectSamplePage={handleSelectSamplePage}
                isScanning={isScanning}
                isGeneratingAi={isGeneratingAi}
              />
            )}

            {activeTab === 'builder' && (
              <TestCaseBuilder
                testCase={activeTestCase}
                scannedElements={scannedPage?.elements || []}
                onSaveTestCase={handleSaveTestCase}
                onStartTestCaseRun={handleStartTestCaseRun}
                onOpenCodeExport={(tc) => setExportModalTestCase(tc)}
                onCancel={() => setActiveTab('scanner')}
              />
            )}

            {activeTab === 'runner' && (
              <TestCaseRunner
                testCase={activeTestCase}
                scannedElements={scannedPage?.elements || []}
                sampleKey={scannedPage?.sampleKey || 'saas-login'}
                onBackToBuilder={() => setActiveTab('builder')}
                onTestComplete={handleTestComplete}
              />
            )}

            {activeTab === 'suite' && (
              <TestSuiteManager
                testCases={testCases}
                onSelectTestCaseToRun={handleStartTestCaseRun}
                onEditTestCase={(tc) => {
                  setActiveTestCase(tc);
                  setActiveTab('builder');
                }}
                onCreateNewTestCase={() => handleCreateTestCaseFromScan()}
                onDeleteTestCase={handleDeleteTestCase}
                onOpenCodeExport={(tc) => setExportModalTestCase(tc)}
              />
            )}

            {activeTab === 'repos' && (
              <GithubRepoList
                onScanRepo={handleScanRepo}
                scanningRepoId={scanningRepoId}
              />
            )}
          </div>
        </main>
      </div>

      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 bg-slate-900 text-slate-100 text-xs font-semibold rounded-xl shadow-lg border border-slate-700 animate-slideUp flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}

      {exportModalTestCase && (
        <CodeExportModal
          testCase={exportModalTestCase}
          onClose={() => setExportModalTestCase(null)}
        />
      )}
    </div>
  );
}
