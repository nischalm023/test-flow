'use client';

import { useEffect, useState } from 'react';
import { ScannedPage, ScannedElement, TestCase, TestCaseStep } from '@/lib/types';
import { DEFAULT_PRESET_TEST_CASES, buildScannedPage, resolveSampleIdForUrl } from '@/data/samplePages';
import { TEST_CASES_KEY, ACTIVE_ID_KEY, loadSavedTestCases } from '@/lib/testCaseStore';
import type { GithubRepo } from '@/features/auth/components/repos';

export function useTestStudio(idParam?: string | null) {
  const [scannedPage, setScannedPage] = useState<ScannedPage | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>(DEFAULT_PRESET_TEST_CASES);
  const [hydrated, setHydrated] = useState(false);
  const [activeTestCase, setActiveTestCaseState] = useState<TestCase>(DEFAULT_PRESET_TEST_CASES[0]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanningRepoId, setScanningRepoId] = useState<number | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const setActiveTestCase = (tc: TestCase) => {
    setActiveTestCaseState(tc);
    try {
      localStorage.setItem(ACTIVE_ID_KEY, tc.id);
    } catch {
      // ignore storage failures
    }
  };

  useEffect(() => {
    const saved = loadSavedTestCases();
    const pool = saved || DEFAULT_PRESET_TEST_CASES;
    if (saved) setTestCases(saved);

    const wantedId = idParam || (() => {
      try {
        return localStorage.getItem(ACTIVE_ID_KEY);
      } catch {
        return null;
      }
    })();

    const found = wantedId ? pool.find((tc) => tc.id === wantedId) : null;
    if (found) {
      setActiveTestCaseState(found);
      setHydrated(true);
      return;
    }

    setActiveTestCaseState(pool[0]);
    setHydrated(true);

    if (wantedId) {
      fetch(`/api/qdrant/test-case?id=${encodeURIComponent(wantedId)}`)
        .then((res) => res.json())
        .then((data: { ok?: boolean; testCase?: TestCase | null }) => {
          const fetched = data.testCase;
          if (data.ok && fetched) {
            setActiveTestCaseState(fetched);
            setTestCases((prev) => [fetched, ...prev.filter((tc) => tc.id !== fetched.id)]);
            showToast('Loaded test case from Qdrant.');
          }
        })
        .catch(() => {
          // Keep the local fallback silently if Qdrant lookup fails.
        });
    }
  }, [idParam]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(TEST_CASES_KEY, JSON.stringify(testCases));
  }, [testCases, hydrated]);

  // Keep the simulated viewport in sync with whichever test case is active,
  // instead of always showing the CloudScale sample regardless of the real target URL.
  useEffect(() => {
    const targetUrl = activeTestCase?.targetUrl;
    const sampleId = resolveSampleIdForUrl(targetUrl);
    if (sampleId) {
      setScannedPage(buildScannedPage(sampleId));
      return;
    }
    setScannedPage({
      url: targetUrl || '',
      title: activeTestCase?.title || 'Custom Target',
      description: activeTestCase?.description || '',
      scannedAt: new Date().toISOString(),
      elements: [],
      counts: { total: 0, buttons: 0, inputs: 0, forms: 0, links: 0, headings: 0 },
      rawHtml: '',
      sampleKey: 'custom',
    });
  }, [activeTestCase]);

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
    await handleScanPage(repo.html_url);
  };

  const handleCreateTestCaseFromScan = (selectedElement?: ScannedElement): TestCase => {
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
    showToast('New test case created! Customize steps or click "Start Test Case UI" to run.');
    return newTestCase;
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
        showToast(`AI synthesized ${normalized.length} test cases!`);
        return normalized as TestCase[];
      }
      return [];
    } catch (e: unknown) {
      console.error('AI Gen error:', e);
      showToast('Generated standard QA test cases.');
      return [];
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
    const githubUrl = scannedPage?.url || '';
    const githubMatch = githubUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    const githubRepo = githubMatch?.[1]?.replace(/\.git$/, '');
    void fetch('/api/qdrant/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testCases: [updated], githubRepo }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          qdrant?: { saved?: boolean; pointsCount?: number };
        };
        if (res.ok && data.qdrant?.saved) {
          showToast(`Test case saved to Qdrant (${data.qdrant.pointsCount ?? 0} points)`);
        } else {
          showToast('Test case saved locally; Qdrant write failed.');
        }
      })
      .catch(() => showToast('Test case saved locally; Qdrant write failed.'));
  };

  const handleDeleteTestCase = (id: string) => {
    setTestCases((prev) => prev.filter((tc) => tc.id !== id));
    showToast('Test case removed from suite.');
  };

  const handleTestComplete = (updatedCase: TestCase, _passed: boolean) => {
    setTestCases((prev) => prev.map((tc) => (tc.id === updatedCase.id ? updatedCase : tc)));
    setActiveTestCase(updatedCase);
  };

  return {
    scannedPage,
    testCases,
    activeTestCase,
    setActiveTestCase,
    isScanning,
    scanningRepoId,
    isGeneratingAi,
    toastMessage,
    showToast,
    handleSelectSamplePage,
    handleScanPage,
    handleScanRepo,
    handleCreateTestCaseFromScan,
    handleAutoGenerateTestCases,
    handleSaveTestCase,
    handleDeleteTestCase,
    handleTestComplete,
  };
}
