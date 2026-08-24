import React, { useState } from 'react';
import { TestCase, TestCaseStep, StepAction, TestPriority, TestCategory, ScannedElement } from '../types';
import { 
  Play, Plus, Trash2, ArrowUp, ArrowDown, Code2, Save, Sparkles,
  MousePointer, Type, CheckCircle, Clock, Eye, Camera, ChevronRight,
  Shield, Check, AlertTriangle, ArrowRight, CornerDownRight, Layers
} from 'lucide-react';

interface TestCaseBuilderProps {
  testCase: TestCase;
  scannedElements: ScannedElement[];
  onSaveTestCase: (updatedCase: TestCase) => void;
  onStartTestCaseRun: (testCase: TestCase) => void;
  onOpenCodeExport: (testCase: TestCase) => void;
  onCancel: () => void;
}

export const TestCaseBuilder: React.FC<TestCaseBuilderProps> = ({
  testCase: initialTestCase,
  scannedElements,
  onSaveTestCase,
  onStartTestCaseRun,
  onOpenCodeExport,
  onCancel,
}) => {
  const [currentTestCase, setCurrentTestCase] = useState<TestCase>(initialTestCase);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(0);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const handleUpdateStep = (index: number, updates: Partial<TestCaseStep>) => {
    setCurrentTestCase(prev => {
      const updatedSteps = [...prev.steps];
      updatedSteps[index] = { ...updatedSteps[index], ...updates };
      return { ...prev, steps: updatedSteps };
    });
  };

  const handleAddStep = (action: StepAction = 'click') => {
    const newStep: TestCaseStep = {
      id: `step-custom-${Date.now()}`,
      order: currentTestCase.steps.length + 1,
      action: action,
      targetSelector: scannedElements[0]?.selector || '#input-work-email',
      targetDescription: scannedElements[0]?.text || 'Target element',
      value: action === 'type' ? 'Sample test input' : undefined,
      expectedValue: action.startsWith('assert') ? 'visible' : undefined,
      timeoutMs: 1500
    };

    setCurrentTestCase(prev => ({
      ...prev,
      steps: [...prev.steps, newStep]
    }));
    setActiveStepIndex(currentTestCase.steps.length);
  };

  const handleDeleteStep = (index: number) => {
    setCurrentTestCase(prev => {
      const updated = prev.steps.filter((_, i) => i !== index).map((s, idx) => ({ ...s, order: idx + 1 }));
      return { ...prev, steps: updated };
    });
    if (activeStepIndex === index) {
      setActiveStepIndex(null);
    } else if (activeStepIndex !== null && activeStepIndex > index) {
      setActiveStepIndex(activeStepIndex - 1);
    }
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= currentTestCase.steps.length) return;

    setCurrentTestCase(prev => {
      const updated = [...prev.steps];
      const temp = updated[index];
      updated[index] = updated[targetIdx];
      updated[targetIdx] = temp;
      return {
        ...prev,
        steps: updated.map((s, i) => ({ ...s, order: i + 1 }))
      };
    });
    setActiveStepIndex(targetIdx);
  };

  const handleSave = () => {
    onSaveTestCase(currentTestCase);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const getActionBadgeColor = (action: StepAction) => {
    switch (action) {
      case 'click': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'type': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'select': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'assert_visible':
      case 'assert_text':
      case 'assert_value': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'wait': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'screenshot': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'navigate': return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card with Meta Controls & Primary Launch Action */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-mono">
                {currentTestCase.category}
              </span>
              <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                currentTestCase.priority === 'critical' ? 'bg-red-50 text-red-700 border-red-200' :
                currentTestCase.priority === 'high' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                'bg-slate-50 text-slate-700 border-slate-200'
              }`}>
                {currentTestCase.priority} Priority
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {currentTestCase.steps.length} Steps
              </span>
            </div>
            <input
              id="test-case-title-input"
              type="text"
              value={currentTestCase.title}
              onChange={(e) => setCurrentTestCase(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Test Case Title..."
              className="text-lg font-bold text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-blue-600 focus:outline-hidden w-full transition-colors py-0.5"
            />
            <input
              id="test-case-description-input"
              type="text"
              value={currentTestCase.description}
              onChange={(e) => setCurrentTestCase(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Test objective and acceptance criteria..."
              className="text-xs text-slate-500 border-b border-transparent hover:border-slate-300 focus:border-blue-600 focus:outline-hidden w-full transition-colors"
            />
          </div>

          {/* Action Button Group */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0">
            <button
              onClick={() => onOpenCodeExport(currentTestCase)}
              className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 active:scale-[0.98]"
            >
              <Code2 className="w-4 h-4 text-slate-600" />
              <span>Export Code</span>
            </button>

            <button
              id="save-test-case-btn"
              onClick={handleSave}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 active:scale-[0.98]"
            >
              {savedSuccess ? <Check className="w-4 h-4 text-emerald-600" /> : <Save className="w-4 h-4" />}
              <span>{savedSuccess ? 'Saved!' : 'Save Test'}</span>
            </button>

            {/* Core user requested Start Test Case button */}
            <button
              id="start-test-case-ui-btn"
              onClick={() => {
                onSaveTestCase(currentTestCase);
                onStartTestCaseRun(currentTestCase);
              }}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Start Test Case UI</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Priority & Category Settings Bar */}
        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Test Category</label>
            <select
              value={currentTestCase.category}
              onChange={(e) => setCurrentTestCase(prev => ({ ...prev, category: e.target.value as TestCategory }))}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
            >
              <option value="E2E">E2E End-to-End Flow</option>
              <option value="Functional">Functional Workflow</option>
              <option value="Smoke">Smoke Verification</option>
              <option value="Negative / Edge Case">Negative / Validation Error</option>
              <option value="Accessibility">Accessibility & ARIA</option>
              <option value="Security">Security / Boundary Testing</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Execution Priority</label>
            <select
              value={currentTestCase.priority}
              onChange={(e) => setCurrentTestCase(prev => ({ ...prev, priority: e.target.value as TestPriority }))}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
            >
              <option value="critical">Critical (Blocker)</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Target Page URL</label>
            <input
              type="text"
              value={currentTestCase.targetUrl}
              onChange={(e) => setCurrentTestCase(prev => ({ ...prev, targetUrl: e.target.value }))}
              className="w-full px-2.5 py-1.5 font-mono text-[11px] bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* Step Sequence Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Step Sequence Checklist */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Step Execution Plan ({currentTestCase.steps.length})</span>
            </h3>

            {/* Quick Add Step Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleAddStep('click')}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                title="Add Click Action"
              >
                + Click
              </button>
              <button
                onClick={() => handleAddStep('type')}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
                title="Add Type Action"
              >
                + Type
              </button>
              <button
                onClick={() => handleAddStep('assert_visible')}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                title="Add Assertion"
              >
                + Assert
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {currentTestCase.steps.map((step, idx) => {
              const isActive = activeStepIndex === idx;
              return (
                <div
                  key={step.id}
                  onClick={() => setActiveStepIndex(idx)}
                  className={`p-3.5 bg-white rounded-xl border transition-all cursor-pointer ${
                    isActive
                      ? 'border-blue-500 ring-2 ring-blue-200/80 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-xs flex items-center justify-center font-bold font-mono shrink-0 mt-0.5">
                        {idx + 1}
                      </span>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold font-mono uppercase px-2 py-0.5 rounded-md border ${getActionBadgeColor(step.action)}`}>
                            {step.action.replace('_', ' ')}
                          </span>
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {step.targetDescription || step.targetSelector}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                          <span className="text-blue-600 truncate">{step.targetSelector}</span>
                          {step.value && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-700 truncate">Value: "{step.value}"</span>
                            </>
                          )}
                          {step.expectedValue && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-emerald-700 font-semibold truncate">Assert: "{step.expectedValue}"</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Step Reorder / Delete Controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveStep(idx, 'up');
                        }}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded-md hover:bg-slate-100"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveStep(idx, 'down');
                        }}
                        disabled={idx === currentTestCase.steps.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded-md hover:bg-slate-100"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStep(idx);
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => handleAddStep('click')}
            className="w-full py-2.5 border-2 border-dashed border-slate-300 hover:border-blue-400 bg-white hover:bg-blue-50/30 text-slate-600 hover:text-blue-600 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Append New Step</span>
          </button>
        </div>

        {/* Right: Active Step Inspector & Parameter Configurator */}
        <div className="lg:col-span-5 space-y-4">
          {activeStepIndex !== null && currentTestCase.steps[activeStepIndex] ? (
            <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="p-1 bg-blue-600 text-white rounded-md text-xs font-bold">
                    #{activeStepIndex + 1}
                  </span>
                  <h4 className="text-xs font-bold text-slate-900">Step Parameter Configurator</h4>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${getActionBadgeColor(currentTestCase.steps[activeStepIndex].action)}`}>
                  {currentTestCase.steps[activeStepIndex].action}
                </span>
              </div>

              <div className="space-y-3.5 text-xs">
                {/* Action Type Selector */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Action Type</label>
                  <select
                    value={currentTestCase.steps[activeStepIndex].action}
                    onChange={(e) => handleUpdateStep(activeStepIndex, { action: e.target.value as StepAction })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <optgroup label="Interaction Actions">
                      <option value="click">Click Element (Mouse Click)</option>
                      <option value="type">Type Text (Keyboard Input)</option>
                      <option value="select">Select Option (Dropdown)</option>
                      <option value="hover">Hover Over Element</option>
                      <option value="scroll">Scroll to View</option>
                    </optgroup>
                    <optgroup label="Validation Assertions">
                      <option value="assert_visible">Assert Element Visible</option>
                      <option value="assert_text">Assert Element Contains Text</option>
                      <option value="assert_value">Assert Input Value Equals</option>
                    </optgroup>
                    <optgroup label="Navigation & Timing">
                      <option value="navigate">Navigate URL</option>
                      <option value="wait">Wait Delay (ms)</option>
                      <option value="screenshot">Capture Visual Snapshot</option>
                    </optgroup>
                  </select>
                </div>

                {/* Target Element Selector with Scanned Dropdown */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Element Selector</label>
                  <input
                    type="text"
                    value={currentTestCase.steps[activeStepIndex].targetSelector}
                    onChange={(e) => handleUpdateStep(activeStepIndex, { targetSelector: e.target.value })}
                    placeholder="#btn-submit or .form-input"
                    className="w-full px-3 py-2 font-mono text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />

                  {/* Quick bind from scanned elements */}
                  {scannedElements.length > 0 && (
                    <div className="mt-1.5">
                      <label className="text-[10px] text-slate-400 uppercase font-semibold">Bind from Scanned Elements:</label>
                      <select
                        onChange={(e) => {
                          const chosen = scannedElements.find(elem => elem.selector === e.target.value);
                          if (chosen) {
                            handleUpdateStep(activeStepIndex, {
                              targetSelector: chosen.selector,
                              targetDescription: chosen.text || chosen.name
                            });
                          }
                        }}
                        value={currentTestCase.steps[activeStepIndex].targetSelector}
                        className="w-full mt-1 px-2 py-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-md text-slate-700"
                      >
                        <option value="">-- Choose Scanned Node --</option>
                        {scannedElements.map((elem) => (
                          <option key={elem.id} value={elem.selector}>
                            {elem.tag.toUpperCase()}: {elem.text || elem.name} ({elem.selector})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Step Description */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Step Objective / Description</label>
                  <input
                    type="text"
                    value={currentTestCase.steps[activeStepIndex].targetDescription}
                    onChange={(e) => handleUpdateStep(activeStepIndex, { targetDescription: e.target.value })}
                    placeholder="e.g. Enter customer email address"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Conditional Fields based on action */}
                {['type', 'select', 'navigate'].includes(currentTestCase.steps[activeStepIndex].action) && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Input / Selected Value</label>
                    <input
                      type="text"
                      value={currentTestCase.steps[activeStepIndex].value || ''}
                      onChange={(e) => handleUpdateStep(activeStepIndex, { value: e.target.value })}
                      placeholder="e.g. user@company.com"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                )}

                {currentTestCase.steps[activeStepIndex].action.startsWith('assert') && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Expected Assertion Value</label>
                    <input
                      type="text"
                      value={currentTestCase.steps[activeStepIndex].expectedValue || ''}
                      onChange={(e) => handleUpdateStep(activeStepIndex, { expectedValue: e.target.value })}
                      placeholder="e.g. visible, Order Confirmed, 200"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                )}

                {/* Timeout */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Step Timeout (ms)</label>
                  <input
                    type="number"
                    value={currentTestCase.steps[activeStepIndex].timeoutMs}
                    onChange={(e) => handleUpdateStep(activeStepIndex, { timeoutMs: Number(e.target.value) || 1000 })}
                    className="w-full px-3 py-1.5 font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center space-y-2">
              <CornerDownRight className="w-5 h-5 text-slate-400 mx-auto" />
              <p className="text-xs font-semibold text-slate-700">Select a step from the sequence</p>
              <p className="text-[11px] text-slate-500">
                Click any step on the left to configure selectors, test payload values, and assertion criteria.
              </p>
            </div>
          )}

          {/* Quick Launch Callout */}
          <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2.5 shadow-xs">
            <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
              <Play className="w-4 h-4 text-blue-600 fill-blue-600" />
              <span>Ready to run this test case?</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Launch the interactive step-by-step visual runner with live cursor animation, assertion validation, and real-time pass/fail logs.
            </p>
            <button
              onClick={() => {
                onSaveTestCase(currentTestCase);
                onStartTestCaseRun(currentTestCase);
              }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
            >
              <span>Launch Test Case UI</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
