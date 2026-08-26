import React, { useState } from 'react';
import { TestCase, TestCategory, TestPriority } from '../types';
import { 
  Play, Plus, Filter, Trash2, Edit3, Code, Download, CheckCircle2,
  XCircle, Clock, ShieldCheck, Sparkles, Layers, ArrowRight, FileText
} from 'lucide-react';

interface TestSuiteManagerProps {
  testCases: TestCase[];
  onSelectTestCaseToRun: (testCase: TestCase) => void;
  onEditTestCase: (testCase: TestCase) => void;
  onCreateNewTestCase: () => void;
  onDeleteTestCase: (id: string) => void;
  onOpenCodeExport: (testCase: TestCase) => void;
}

export const TestSuiteManager: React.FC<TestSuiteManagerProps> = ({
  testCases,
  onSelectTestCaseToRun,
  onEditTestCase,
  onCreateNewTestCase,
  onDeleteTestCase,
  onOpenCodeExport,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredCases = testCases.filter((tc) => {
    const matchesCategory = selectedCategory === 'all' || tc.category === selectedCategory;
    const matchesPriority = selectedPriority === 'all' || tc.priority === selectedPriority;
    const matchesSearch = !searchQuery || 
      tc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tc.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tc.targetUrl.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesPriority && matchesSearch;
  });

  const passedCount = testCases.filter(tc => tc.status === 'passed').length;
  const failedCount = testCases.filter(tc => tc.status === 'failed').length;
  const readyCount = testCases.filter(tc => tc.status === 'ready' || tc.status === 'draft').length;

  const handleExportSuiteReport = () => {
    const reportMarkdown = `# QA Automated Test Suite Execution Report
Generated on: ${new Date().toLocaleString()}

## Summary
- **Total Test Cases**: ${testCases.length}
- **Passed**: ${passedCount}
- **Failed**: ${failedCount}
- **Pending/Ready**: ${readyCount}
- **Overall Pass Rate**: ${testCases.length > 0 ? Math.round((passedCount / testCases.length) * 100) : 0}%

---

## Test Cases Breakdown
${testCases.map((tc, idx) => `
### ${idx + 1}. ${tc.title}
- **Category**: ${tc.category}
- **Priority**: ${tc.priority.toUpperCase()}
- **Status**: ${tc.status.toUpperCase()}
- **Target URL**: \`${tc.targetUrl}\`
- **Steps Count**: ${tc.steps.length}
- **Description**: ${tc.description}

**Steps Sequence:**
${tc.steps.map(s => `  ${s.order}. \`${s.action.toUpperCase()}\` -> Target: \`${s.targetSelector}\` ${s.value ? `(Value: "${s.value}")` : ''} ${s.expectedValue ? `(Assert: "${s.expectedValue}")` : ''}`).join('\n')}
`).join('\n---\n')}
`;

    const blob = new Blob([reportMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QA-Test-Report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Suite Header & Stats */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              <span>QA Test Suite & Repository</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage, organize, and batch-execute automated test cases generated from page scans.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportSuiteReport}
              className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export Report (MD)</span>
            </button>

            <button
              onClick={onCreateNewTestCase}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Test Case</span>
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Test Cases</span>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{testCases.length}</p>
          </div>
          <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-200">
            <span className="text-[10px] uppercase font-bold text-emerald-600">Passed Cases</span>
            <p className="text-xl font-bold text-emerald-800 mt-0.5">{passedCount}</p>
          </div>
          <div className="p-3.5 bg-rose-50/70 rounded-xl border border-rose-200">
            <span className="text-[10px] uppercase font-bold text-rose-600">Failed Cases</span>
            <p className="text-xl font-bold text-rose-800 mt-0.5">{failedCount}</p>
          </div>
          <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200">
            <span className="text-[10px] uppercase font-bold text-blue-600">Suite Health</span>
            <p className="text-xl font-bold text-blue-900 mt-0.5">
              {testCases.length > 0 ? Math.round((passedCount / testCases.length) * 100) : 100}%
            </p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="w-full md:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search test cases by title, target, or query..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs transition-all"
          />
        </div>

        {/* Category & Priority Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs transition-all"
          >
            <option value="all">All Categories</option>
            <option value="E2E">E2E Flow</option>
            <option value="Functional">Functional</option>
            <option value="Smoke">Smoke</option>
            <option value="Negative / Edge Case">Negative / Error Validation</option>
            <option value="Accessibility">Accessibility</option>
            <option value="Security">Security</option>
          </select>

          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs transition-all"
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Test Cases Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredCases.map((tc) => {
          return (
            <div
              key={tc.id}
              className="p-5 bg-white border border-slate-200 hover:border-blue-300 rounded-xl shadow-xs hover:shadow-md transition-all space-y-3.5 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-mono">
                      {tc.category}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      tc.priority === 'critical' ? 'bg-red-50 text-red-700' :
                      tc.priority === 'high' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {tc.priority}
                    </span>
                  </div>

                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    tc.status === 'passed' ? 'bg-emerald-50 text-emerald-700' :
                    tc.status === 'failed' ? 'bg-rose-50 text-rose-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {tc.status === 'passed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                    {tc.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-rose-600" />}
                    {tc.status === 'ready' && <Clock className="w-3.5 h-3.5 text-slate-400" />}
                    {tc.status.charAt(0).toUpperCase() + tc.status.slice(1)}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 leading-snug">{tc.title}</h3>
                <p className="text-xs text-slate-500 line-clamp-2">{tc.description}</p>
                <p className="text-[11px] font-mono text-blue-600 truncate">{tc.targetUrl}</p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-slate-500">
                  {tc.steps.length} Steps {tc.executionStats?.durationMs ? `• ${tc.executionStats.durationMs}ms` : ''}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onOpenCodeExport(tc)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                    title="Export Code"
                  >
                    <Code className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onEditTestCase(tc)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                    title="Edit Test Case"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteTestCase(tc.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Delete Test Case"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onSelectTestCaseToRun(tc)}
                    data-testid={`run-test-${tc.id}`}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 ml-1"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Run Test</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
