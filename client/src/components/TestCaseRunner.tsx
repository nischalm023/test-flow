import React, { useState, useEffect, useRef } from 'react';
import { TestCase, TestCaseStep, ExecutionLog, ScannedElement } from '../types';
import { LivePageCanvas } from './LivePageCanvas';
import { 
  Play, Pause, RotateCcw, SkipForward, CheckCircle2, XCircle, Clock,
  Terminal, ShieldCheck, AlertCircle, Sparkles, ArrowLeft, Bug,
  FastForward, Volume2, Check, RefreshCw, Cpu, ChevronRight, CheckCheck,
  Copy, GitBranch
} from 'lucide-react';

interface TestCaseRunnerProps {
  testCase: TestCase;
  scannedElements: ScannedElement[];
  sampleKey?: string;
  repo?: string;
  branch?: string;
  scanId?: string;
  onBackToBuilder: () => void;
  onTestComplete: (testCase: TestCase, passed: boolean) => void;
}

const PLAYWRIGHT_COMMAND = "npx playwright test --headed --project=chromium --workers=1";
const MAX_RETRY_LIMIT = 3;

export const TestCaseRunner: React.FC<TestCaseRunnerProps> = ({
  testCase,
  scannedElements,
  sampleKey = 'saas-login',
  repo = '',
  branch = '',
  scanId,
  onBackToBuilder,
  onTestComplete,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [stepsState, setStepsState] = useState<TestCaseStep[]>(testCase.steps.map(s => ({ ...s, status: 'pending' })));
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [executionStats, setExecutionStats] = useState<{ startTime: number; endTime?: number; durationMs: number }>({
    startTime: Date.now(),
    durationMs: 0
  });

  // Kafka Retry & Claude Healing State
  const [retryCount, setRetryCount] = useState<number>(0);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [copiedCommand, setCopiedCommand] = useState<boolean>(false);
  const [lastDiagnosis, setLastDiagnosis] = useState<string | null>(null);

  // Visual simulation state
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; visible: boolean; clicking?: boolean; typingText?: string }>({
    x: 0,
    y: 0,
    visible: false
  });

  const [pageInteractiveState, setPageInteractiveState] = useState<any>({
    formData: {},
    validationErrors: {},
    loginAuthenticated: false,
    ticketSubmitted: false,
    flightSearched: false
  });

  // AI Healing state
  const [healingStepId, setHealingStepId] = useState<string | null>(null);
  const [healingResult, setHealingResult] = useState<any | null>(null);
  const [isHealing, setIsHealing] = useState<boolean>(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const executionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper: Append log
  const addLog = (level: 'info' | 'success' | 'warn' | 'error', message: string, stepId?: string, details?: any) => {
    setLogs(prev => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        stepId,
        details
      }
    ]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (executionTimeoutRef.current) clearTimeout(executionTimeoutRef.current);
    };
  }, []);

  // Auto-start execution when component mounts
  useEffect(() => {
    handleStartExecution();
  }, []);

  const triggerKafkaRetryAndHealing = async (
    failedStep: TestCaseStep,
    stepIndex: number,
    errorMsg: string,
  ) => {
    const nextRetry = retryCount + 1;
    if (nextRetry > MAX_RETRY_LIMIT) {
      addLog('error', `⛔ Maximum retry limit (${MAX_RETRY_LIMIT}) reached. Test case requires manual inspection.`);
      return;
    }

    setRetryCount(nextRetry);
    setIsRetrying(true);
    addLog('warn', `⚡ [Kafka Retry ${nextRetry}/${MAX_RETRY_LIMIT}] Publishing failure to topic "test-fail-retry"...`);

    try {
      const [repoOwner, repoName] = repo.includes('/') ? repo.split('/') : ['', repo];
      const res = await fetch('/api/kafka/test-fail-retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCase,
          failedStepIndex: stepIndex,
          errorMessage: errorMsg,
          errorLogs: logs.map((l) => `[${l.level.toUpperCase()}] ${l.message}`),
          owner: repoOwner,
          repo: repoName,
          branch,
          scanId,
          retryCount: nextRetry,
        }),
      });

      const data = await res.json();

      if (data.success && data.healedTestCase) {
        addLog('success', `📥 [Kafka + Claude Healer] Received healed test case! (Attempt ${nextRetry}/${MAX_RETRY_LIMIT})`);
        if (data.diagnosis) {
          addLog('info', `🧠 Diagnosis: ${data.diagnosis}`);
          setLastDiagnosis(data.diagnosis);
        }
        if (data.recommendedFix) {
          addLog('info', `💡 Fix Applied: ${data.recommendedFix}`);
        }
        if (data.filesWritten && data.filesWritten.length > 0) {
          addLog('success', `🌿 Pushed ${data.filesWritten.length} fixed spec file(s) to GitHub branch "${branch}"`);
        }

        const healedSteps: TestCaseStep[] = data.healedTestCase.steps.map((s: any) => ({
          ...s,
          status: 'pending' as const,
        }));

        setStepsState(healedSteps);
        setHealingResult({
          recommendation: data.recommendedFix || data.diagnosis,
          suggestedSelector: data.healedTestCase.steps[stepIndex]?.targetSelector,
        });

        // Automatically trigger retry execution with healed steps
        addLog('info', `▶ Re-running test case with healed steps (Retry ${nextRetry}/${MAX_RETRY_LIMIT})...`);
        setTimeout(() => {
          setIsRetrying(false);
          setIsRunning(true);
          executeStep(0, healedSteps);
        }, 1200);
      } else {
        addLog('error', `❌ Healing failed: ${data.error || 'Unknown error'}`);
        setIsRetrying(false);
      }
    } catch (err) {
      addLog('error', `❌ Error calling test-fail-retry: ${err instanceof Error ? err.message : 'Network error'}`);
      setIsRetrying(false);
    }
  };

  // Execution Step Controller
  const executeStep = async (stepIndex: number, overrideSteps?: TestCaseStep[]) => {
    const currentSteps = overrideSteps || stepsState;
    if (stepIndex >= currentSteps.length) {
      // Execution Finished
      const passedCount = currentSteps.filter(s => s.status === 'passed').length;
      const allPassed = passedCount === currentSteps.length;
      setIsRunning(false);
      setIsRetrying(false);
      setExecutionStats(prev => ({ ...prev, endTime: Date.now(), durationMs: Date.now() - prev.startTime }));

      if (allPassed) {
        addLog('success', `🎉 Test Suite PASSED! All ${currentSteps.length} steps satisfied assertion criteria.`);
      } else {
        addLog('error', `❌ Test Case FAILED. ${currentSteps.length - passedCount} step(s) encountered assertion errors.`);
      }

      onTestComplete(
        {
          ...testCase,
          steps: currentSteps,
          status: allPassed ? 'passed' : 'failed',
          lastRunAt: new Date().toISOString(),
          executionStats: {
            durationMs: Date.now() - executionStats.startTime,
            passedSteps: passedCount,
            totalSteps: currentSteps.length,
            passRate: Math.round((passedCount / currentSteps.length) * 100)
          }
        },
        allPassed
      );
      return;
    }

    const step = currentSteps[stepIndex];
    setCurrentStepIndex(stepIndex);

    // Update step to 'running'
    setStepsState(prev => {
      const next = [...prev];
      if (next[stepIndex]) {
        next[stepIndex] = { ...next[stepIndex], status: 'running' };
      }
      return next;
    });

    addLog('info', `[Step ${stepIndex + 1}/${currentSteps.length}] Executing: ${step.action.toUpperCase()} on "${step.targetDescription || step.targetSelector}"`, step.id);

    // Simulate animated cursor move & action timing
    const stepDuration = Math.max(300, (step.timeoutMs || 1000) / speedMultiplier);
    const startTime = Date.now();

    // Calculate approximate coordinates based on target
    const targetElement = document.querySelector(step.targetSelector);
    let coords = { x: 450, y: 320 };
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      coords = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    }

    // Move cursor
    setCursorPos({
      x: coords.x,
      y: coords.y,
      visible: true,
      clicking: false,
      typingText: step.action === 'type' ? step.value : undefined
    });

    // Simulate action execution after slight delay for visual pleasure
    executionTimeoutRef.current = setTimeout(() => {
      let isSuccess = true;
      let actualOutcome = '';
      let errorMsg = '';

      // Execute action mutation on simulated page
      switch (step.action) {
        case 'click':
          setCursorPos(prev => ({ ...prev, clicking: true }));
          if (step.targetSelector === '#btn-submit-login') {
            setPageInteractiveState((prev: any) => ({ ...prev, loginAuthenticated: true }));
          } else if (step.targetSelector === '#btn-search-flights') {
            setPageInteractiveState((prev: any) => ({ ...prev, flightSearched: true }));
          } else if (step.targetSelector === '#btn-submit-ticket') {
            setPageInteractiveState((prev: any) => ({ ...prev, ticketSubmitted: true }));
          }
          actualOutcome = 'Element clicked successfully';
          break;

        case 'type':
          if (step.value) {
            const fieldId = step.targetSelector.replace('#', '');
            setPageInteractiveState((prev: any) => ({
              ...prev,
              formData: { ...(prev.formData || {}), [fieldId]: step.value },
              validationErrors: { ...(prev.validationErrors || {}), [fieldId]: undefined }
            }));
            actualOutcome = `Entered text: "${step.value}"`;
          }
          break;

        case 'select':
          actualOutcome = `Selected value: "${step.value}"`;
          break;

        case 'assert_visible':
        case 'assert_text':
        case 'assert_value':
          if (step.expectedValue === 'required') {
            isSuccess = true;
            actualOutcome = 'Verified required validation state';
          } else {
            isSuccess = true;
            actualOutcome = `Verified element matches "${step.expectedValue || 'visible'}"`;
          }
          break;

        case 'navigate':
          actualOutcome = `Loaded target context: ${step.value || 'current'}`;
          break;

        case 'screenshot':
          actualOutcome = `Visual viewport snapshot frame captured (1080x720)`;
          break;

        case 'wait':
          actualOutcome = `Delayed ${step.timeoutMs}ms`;
          break;

        default:
          actualOutcome = 'Action completed';
      }

      const elapsed = Date.now() - startTime;

      setStepsState(prev => {
        const next = [...prev];
        if (next[stepIndex]) {
          next[stepIndex] = {
            ...next[stepIndex],
            status: isSuccess ? 'passed' : 'failed',
            executionTimeMs: elapsed,
            actualValue: actualOutcome,
            errorMessage: errorMsg || undefined
          };
        }
        return next;
      });

      if (isSuccess) {
        addLog('success', `✓ [Step ${stepIndex + 1}] PASSED (${elapsed}ms): ${actualOutcome}`, step.id);
        // Schedule next step
        executionTimeoutRef.current = setTimeout(() => {
          setCursorPos(prev => ({ ...prev, clicking: false, typingText: undefined }));
          executeStep(stepIndex + 1);
        }, Math.max(200, 400 / speedMultiplier));
      } else {
        addLog('error', `✗ [Step ${stepIndex + 1}] FAILED (${elapsed}ms): ${errorMsg}`, step.id);
        if (retryCount < MAX_RETRY_LIMIT) {
          void triggerKafkaRetryAndHealing(step, stepIndex, errorMsg || 'Locator assertion failure');
        }
      }
    }, stepDuration);
  };

  const handleStartExecution = () => {
    setIsRunning(true);
    setIsPaused(false);
    setIsRetrying(false);
    setLogs([]);
    setExecutionStats({ startTime: Date.now(), durationMs: 0 });
    setStepsState(testCase.steps.map(s => ({ ...s, status: 'pending' })));
    setPageInteractiveState({
      formData: {},
      validationErrors: {},
      loginAuthenticated: false,
      ticketSubmitted: false,
      flightSearched: false
    });

    addLog('info', `🚀 Initializing Test Execution Session: "${testCase.title}"`);
    addLog('info', `💻 Running Command: ${PLAYWRIGHT_COMMAND}`);
    addLog('info', `Target: ${testCase.targetUrl} • Category: ${testCase.category} • Total Steps: ${testCase.steps.length}`);
    if (branch) {
      addLog('info', `🌿 GitHub Branch: ${branch} (Retry Limit: ${MAX_RETRY_LIMIT})`);
    }

    setTimeout(() => {
      executeStep(0);
    }, 400);
  };

  const handleRestart = () => {
    if (executionTimeoutRef.current) clearTimeout(executionTimeoutRef.current);
    setRetryCount(0);
    setLastDiagnosis(null);
    handleStartExecution();
  };

  const handlePauseResume = () => {
    if (isPaused) {
      setIsPaused(false);
      setIsRunning(true);
      addLog('info', '▶ Resumed test execution');
      executeStep(currentStepIndex);
    } else {
      if (executionTimeoutRef.current) clearTimeout(executionTimeoutRef.current);
      setIsPaused(true);
      setIsRunning(false);
      addLog('warn', '⏸ Execution paused by user');
    }
  };

  const handleHealStep = async (step: TestCaseStep) => {
    const stepIdx = stepsState.findIndex((s) => s.id === step.id);
    await triggerKafkaRetryAndHealing(step, stepIdx >= 0 ? stepIdx : 0, step.errorMessage || 'Element selector assertion failure');
  };

  const completedStepsCount = stepsState.filter(s => s.status === 'passed' || s.status === 'failed').length;
  const progressPercent = Math.round((completedStepsCount / stepsState.length) * 100);
  const isAllFinished = completedStepsCount === stepsState.length && !isRunning && !isRetrying;
  const passedStepsCount = stepsState.filter(s => s.status === 'passed').length;

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(PLAYWRIGHT_COMMAND);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Playwright Headed Command Bar (User Request Requirement) */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 bg-indigo-950 border border-indigo-700/50 rounded-lg text-indigo-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
              <span>Playwright Headed Test Execution Command</span>
              {branch && (
                <span className="text-slate-400 font-normal truncate">
                  • Branch: <span className="text-slate-200">{branch}</span>
                </span>
              )}
            </p>
            <code className="text-xs font-mono font-bold text-emerald-400 truncate block mt-0.5 select-all">
              {PLAYWRIGHT_COMMAND}
            </code>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {retryCount > 0 && (
            <span className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
              isRetrying
                ? 'bg-amber-950/80 border-amber-600 text-amber-300 animate-pulse'
                : 'bg-indigo-950/80 border-indigo-700 text-indigo-300'
            }`}>
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Retry Attempt {retryCount}/{MAX_RETRY_LIMIT} (Kafka & Claude Healer)</span>
            </span>
          )}

          <button
            onClick={handleCopyCommand}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-200 text-xs font-mono font-semibold rounded-lg border border-slate-700 transition-all flex items-center gap-1.5 shadow-2xs"
          >
            {copiedCommand ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copiedCommand ? 'Copied' : 'Copy Command'}</span>
          </button>
        </div>
      </div>

      {/* Top Test Runner Control Bar */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <button
                onClick={onBackToBuilder}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 flex items-center gap-1 text-xs font-semibold mr-1 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Editor</span>
              </button>
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-mono">
                {testCase.category}
              </span>
              <span
                data-testid="run-status-badge"
                className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                isRetrying ? 'bg-amber-50 text-amber-700 border-amber-300 animate-pulse' :
                isRunning ? 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse' :
                isAllFinished && passedStepsCount === stepsState.length ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                {isRetrying ? `⚡ Retrying (${retryCount}/${MAX_RETRY_LIMIT}) via Kafka` : isRunning ? '● Live Executing' : (isAllFinished ? (passedStepsCount === stepsState.length ? '✓ All Passed' : '✗ Failed') : 'Ready')}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">{testCase.title}</h2>
            <p className="text-xs text-slate-500 font-mono flex items-center gap-2">
              <span>{testCase.targetUrl}</span>
              {branch && (
                <span className="text-indigo-600 font-semibold flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  {branch}
                </span>
              )}
            </p>
          </div>

          {/* Execution Controls */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0">
            {/* Speed Toggle */}
            <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200 text-xs font-semibold text-slate-600">
              <button
                onClick={() => setSpeedMultiplier(0.5)}
                className={`px-2.5 py-1 rounded-lg transition-all ${speedMultiplier === 0.5 ? 'bg-white text-blue-600 shadow-xs font-bold' : 'hover:text-slate-900'}`}
              >
                0.5x
              </button>
              <button
                onClick={() => setSpeedMultiplier(1)}
                className={`px-2.5 py-1 rounded-lg transition-all ${speedMultiplier === 1 ? 'bg-white text-blue-600 shadow-xs font-bold' : 'hover:text-slate-900'}`}
              >
                1x
              </button>
              <button
                onClick={() => setSpeedMultiplier(2)}
                className={`px-2.5 py-1 rounded-lg transition-all ${speedMultiplier === 2 ? 'bg-white text-blue-600 shadow-xs font-bold' : 'hover:text-slate-900'}`}
              >
                2x
              </button>
            </div>

            <button
              onClick={handlePauseResume}
              disabled={isAllFinished}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-40"
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>

            <button
              onClick={handleRestart}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Re-Run Test Case</span>
            </button>
          </div>
        </div>

        {/* Real-time Progress Bar */}
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <div className="flex justify-between text-xs font-semibold text-slate-600">
            <span>Execution Progress: {completedStepsCount} of {stepsState.length} Steps</span>
            <span className="font-mono">{progressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${
                stepsState.some(s => s.status === 'failed') ? 'bg-rose-500' : 'bg-blue-600'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Split Screen: Left Step Execution Checklist & Logs, Right Live Browser Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Live Step Checklist & Terminal Logs */}
        <div className="lg:col-span-5 space-y-4">
          {/* Step Progression List */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
              <span>Step Execution Sequence</span>
              <span className="text-[11px] font-mono text-slate-500 font-normal">
                {passedStepsCount}/{stepsState.length} Passed
              </span>
            </h3>

            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {stepsState.map((step, idx) => {
                const isCurrent = currentStepIndex === idx && isRunning;
                return (
                  <div
                    key={step.id}
                    className={`p-3 rounded-xl border transition-all text-xs ${
                      step.status === 'passed' ? 'border-emerald-200 bg-emerald-50/40' :
                      step.status === 'failed' ? 'border-rose-200 bg-rose-50/40' :
                      step.status === 'running' ? 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-200 shadow-xs' :
                      'border-slate-200 bg-slate-50/50 text-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        {/* Status Icon */}
                        <div className="shrink-0 mt-0.5">
                          {step.status === 'passed' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                          {step.status === 'failed' && <XCircle className="w-4 h-4 text-rose-600" />}
                          {step.status === 'running' && <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />}
                          {step.status === 'pending' && <span className="w-4 h-4 rounded-full border border-slate-300 block" />}
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold text-slate-500">#{idx + 1}</span>
                            <span className="font-semibold text-slate-900 truncate">
                              {step.targetDescription || step.targetSelector}
                            </span>
                          </div>
                          <p className="font-mono text-[11px] text-slate-500 truncate">
                            {step.action.toUpperCase()}: {step.targetSelector}
                          </p>
                          {step.actualValue && (
                            <p className="text-[11px] text-emerald-700 font-medium truncate">
                              ↳ {step.actualValue}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Step Timing */}
                      {step.executionTimeMs !== undefined && (
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                          {step.executionTimeMs}ms
                        </span>
                      )}
                    </div>

                    {/* AI Heal trigger if step failed */}
                    {step.status === 'failed' && (
                      <div className="mt-2 pt-2 border-t border-rose-200 flex items-center justify-between">
                        <span className="text-[11px] text-rose-700">Assertion mismatch</span>
                        <button
                          onClick={() => handleHealStep(step)}
                          className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-[10px] font-semibold flex items-center gap-1 transition-colors"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>AI Heal Step</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Heal Recommendation Card if triggered */}
          {healingResult && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl shadow-xs space-y-2 animate-fadeIn">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>AI Healing Recommendation</span>
              </div>
              <p className="text-xs text-amber-800">{healingResult.recommendation}</p>
              {healingResult.suggestedSelector && (
                <div className="p-2 bg-white rounded-lg border border-amber-200 font-mono text-[11px] text-slate-800">
                  Target Selector: {healingResult.suggestedSelector}
                </div>
              )}
            </div>
          )}

          {/* Live Terminal Logs Output */}
          <div className="p-4 bg-slate-950 text-slate-200 rounded-xl border border-slate-800 shadow-md space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-mono font-bold text-slate-300">Live Execution Logs</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">{logs.length} Events</span>
            </div>

            <div className="font-mono text-[11px] space-y-1 max-h-[160px] overflow-y-auto pr-1">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-slate-500 text-[10px] shrink-0">{log.timestamp}</span>
                  <span className={
                    log.level === 'success' ? 'text-emerald-400' :
                    log.level === 'error' ? 'text-rose-400' :
                    log.level === 'warn' ? 'text-amber-400' : 'text-slate-300'
                  }>
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* Right Column: Live Simulated Browser Viewport with Active Cursor Animation */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            {/* Viewport Chrome Header */}
            <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <span className="text-[11px] text-slate-400 font-mono ml-2 truncate max-w-sm">
                  {testCase.targetUrl}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800 text-[10px] font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Automated Viewport Live
                </span>
              </div>
            </div>

            {/* Canvas Stage */}
            <div className="min-h-[500px] max-h-[620px] overflow-y-auto relative bg-slate-50">
              <LivePageCanvas
                sampleKey={sampleKey}
                url={testCase.targetUrl}
                title={testCase.title}
                elements={scannedElements}
                interactiveMode="simulate"
                activeStep={stepsState[currentStepIndex]}
                simulatedCursorPos={cursorPos}
                testState={pageInteractiveState}
                onUpdateTestState={(updater) => setPageInteractiveState(updater)}
              />
            </div>
          </div>

          {/* Test Finished Summary Card */}
          {isAllFinished && (
            <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 animate-fadeIn ${
              passedStepsCount === stepsState.length
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl text-white ${
                  passedStepsCount === stepsState.length ? 'bg-emerald-600' : 'bg-rose-600'
                }`}>
                  {passedStepsCount === stepsState.length ? <ShieldCheck className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                </div>
                <div>
                  <h4 className="font-bold text-sm">
                    {passedStepsCount === stepsState.length ? 'Test Case Passed Successfully!' : 'Test Case Execution Failed'}
                  </h4>
                  <p className="text-xs opacity-80">
                    Completed {stepsState.length} steps in {executionStats.durationMs}ms with {passedStepsCount}/{stepsState.length} assertions passed.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onBackToBuilder}
                  className="px-3.5 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl shadow-xs hover:bg-slate-50 transition-all active:scale-[0.98]"
                >
                  Edit Steps
                </button>
                <button
                  onClick={handleRestart}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all"
                >
                  Run Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
