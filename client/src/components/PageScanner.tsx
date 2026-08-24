import React, { useState } from 'react';
import { ScannedPage, ScannedElement, ElementCategory } from '../types';
import { SAMPLE_PAGES } from '../data/samplePages';
import { LivePageCanvas } from './LivePageCanvas';
import { 
  Globe, Search, Sparkles, Layers, MousePointerClick, ShieldAlert,
  CheckCircle2, PlusCircle, ArrowRight, Code, FileText, Filter,
  ExternalLink, Copy, Check, Play, RefreshCw, Cpu
} from 'lucide-react';

interface PageScannerProps {
  scannedPage: ScannedPage | null;
  onScanPage: (url: string, rawHtml?: string, sampleKey?: string) => Promise<void>;
  onCreateTestCaseFromScan: (selectedElement?: ScannedElement) => void;
  onAutoGenerateTestCases: (prompt?: string, category?: string) => Promise<void>;
  onSelectSamplePage: (sampleId: string) => void;
  isScanning: boolean;
  isGeneratingAi: boolean;
}

export const PageScanner: React.FC<PageScannerProps> = ({
  scannedPage,
  onScanPage,
  onCreateTestCaseFromScan,
  onAutoGenerateTestCases,
  onSelectSamplePage,
  isScanning,
  isGeneratingAi,
}) => {
  const [urlInput, setUrlInput] = useState<string>(scannedPage?.url || 'https://app.cloudscale.io/login');
  const [inputMode, setInputMode] = useState<'url' | 'presets' | 'html'>('presets');
  const [rawHtmlInput, setRawHtmlInput] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<ElementCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedElement, setSelectedElement] = useState<ScannedElement | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | undefined>();
  const [copiedSelector, setCopiedSelector] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [aiCustomPrompt, setAiCustomPrompt] = useState<string>('');
  const [aiCategoryFocus, setAiCategoryFocus] = useState<string>('Comprehensive E2E & Smoke');

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === 'html') {
      onScanPage('custom-markup.local', rawHtmlInput);
    } else {
      onScanPage(urlInput);
    }
  };

  const handlePresetSelect = (presetId: string) => {
    const sample = SAMPLE_PAGES.find(s => s.id === presetId);
    if (sample) {
      setUrlInput(sample.defaultUrl);
      onSelectSamplePage(presetId);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSelector(id);
    setTimeout(() => setCopiedSelector(null), 2000);
  };

  const filteredElements = (scannedPage?.elements || []).filter(elem => {
    const matchesCategory = selectedCategory === 'all' || elem.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      elem.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      elem.selector.toLowerCase().includes(searchQuery.toLowerCase()) ||
      elem.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (elem.placeholder && elem.placeholder.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const getCategoryBadge = (category: ElementCategory) => {
    switch (category) {
      case 'action': return <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 font-bold text-[10px] rounded font-mono">BTN</span>;
      case 'input': return <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 font-bold text-[10px] rounded font-mono">FLD</span>;
      case 'navigation': return <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 font-bold text-[10px] rounded font-mono">LNK</span>;
      case 'content': return <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-bold text-[10px] rounded font-mono">TXT</span>;
      default: return <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 font-bold text-[10px] rounded font-mono">DOM</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Scanner Input Bar */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600" />
              <span>Web Page Inspector & Target Scanner</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Scan live web applications, sample prototypes, or markup to detect interactive controls and generate automated tests.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 self-start sm:self-auto">
            <button
              id="mode-presets-btn"
              onClick={() => setInputMode('presets')}
              className={`px-3 py-1.5 rounded-md transition-all ${inputMode === 'presets' ? 'bg-white text-blue-600 shadow-xs font-semibold' : 'hover:text-slate-900'}`}
            >
              Demo Prototypes
            </button>
            <button
              id="mode-url-btn"
              onClick={() => setInputMode('url')}
              className={`px-3 py-1.5 rounded-md transition-all ${inputMode === 'url' ? 'bg-white text-blue-600 shadow-xs font-semibold' : 'hover:text-slate-900'}`}
            >
              Live URL
            </button>
            <button
              id="mode-html-btn"
              onClick={() => setInputMode('html')}
              className={`px-3 py-1.5 rounded-md transition-all ${inputMode === 'html' ? 'bg-white text-blue-600 shadow-xs font-semibold' : 'hover:text-slate-900'}`}
            >
              Paste HTML
            </button>
          </div>
        </div>

        {/* Presets List */}
        {inputMode === 'presets' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
            {SAMPLE_PAGES.map((sample) => {
              const isCurrent = scannedPage?.sampleKey === sample.id;
              return (
                <button
                  key={sample.id}
                  onClick={() => handlePresetSelect(sample.id)}
                  className={`p-3 text-left rounded-xl border transition-all relative overflow-hidden ${
                    isCurrent 
                      ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-200/70 shadow-xs' 
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono">
                      {sample.category}
                    </span>
                    <span className="text-[10px] font-medium text-blue-600">
                      {sample.badge}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 truncate">{sample.name}</h4>
                  <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">{sample.description}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Live URL Input Form */}
        {inputMode === 'url' && (
          <form onSubmit={handleScanSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="url-scan-input"
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/checkout or login"
                className="w-full pl-9 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <button
              id="scan-page-btn"
              type="submit"
              disabled={isScanning}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50 shrink-0"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning DOM...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Scan Web Page</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Raw HTML Mode */}
        {inputMode === 'html' && (
          <form onSubmit={handleScanSubmit} className="space-y-2">
            <textarea
              id="raw-html-input"
              rows={4}
              value={rawHtmlInput}
              onChange={(e) => setRawHtmlInput(e.target.value)}
              placeholder="<form id='test-form'><input name='username' /><button type='submit'>Log in</button></form>"
              className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end">
              <button
                id="scan-html-btn"
                type="submit"
                disabled={isScanning || !rawHtmlInput.trim()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Parse HTML Markup</span>
              </button>
            </div>
          </form>
        )}

        {/* Action Header & Scan Summary Banner */}
        {scannedPage && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {scannedPage.title}
              </span>
              <span className="text-slate-300">•</span>
              <span className="font-mono text-slate-500 text-[11px] truncate max-w-xs">{scannedPage.url}</span>
              <span className="text-slate-300">•</span>
              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold text-[11px] border border-blue-100">
                {scannedPage.elements.length} Interactive Nodes
              </span>
            </div>

            {/* Primary "Create Test Case" Button & AI Generator */}
            <div className="flex items-center gap-2">
              <button
                id="auto-generate-ai-btn"
                onClick={() => setShowAiModal(true)}
                disabled={isGeneratingAi}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>AI Auto-Gen Suite</span>
              </button>

              {/* Main requested Create Test Case button - Professional Polish styling */}
              <button
                id="create-test-case-main-btn"
                onClick={() => onCreateTestCaseFromScan(selectedElement || undefined)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Create Test Case</span>
                <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Split Screen: Left Canvas, Right Inspector & DOM inventory */}
      {scannedPage && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left / Center: Interactive Live Viewport & Inspection Stage */}
          <div className="lg:col-span-8 space-y-3">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              {/* Browser Mockup Chrome Header */}
              <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono ml-2 truncate max-w-sm">
                    {scannedPage.url}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-mono">
                    <MousePointerClick className="w-3 h-3 text-indigo-400" />
                    Click element to target
                  </span>
                </div>
              </div>

              {/* Viewport Canvas */}
              <div className="min-h-[460px] max-h-[580px] overflow-y-auto relative bg-slate-50">
                <LivePageCanvas
                  sampleKey={scannedPage.sampleKey || 'saas-login'}
                  url={scannedPage.url}
                  title={scannedPage.title}
                  elements={scannedPage.elements}
                  selectedElementId={selectedElement?.id}
                  hoveredElementId={hoveredElementId}
                  onSelectElement={(elem) => setSelectedElement(elem)}
                  onHoverElement={(id) => setHoveredElementId(id)}
                  interactiveMode="inspect"
                />
              </div>
            </div>

            {/* Quick Inspection Hint Bar */}
            <div className="flex items-center justify-between text-xs text-slate-500 px-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Hover to inspect selectors • Click to link to new Test Case
              </span>
              <span className="font-mono text-slate-400">DOM Elements: {scannedPage.elements.length}</span>
            </div>
          </div>

          {/* Right Column: Element Inspector & Filterable DOM Inventory */}
          <div className="lg:col-span-4 space-y-4">
            {/* Selected / Inspected Element Card */}
            {selectedElement ? (
              <div className="p-4 bg-blue-50/40 border border-blue-200 rounded-xl shadow-xs space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between pb-2 border-b border-blue-200/70">
                  <div className="flex items-center gap-2">
                    <span className="p-1 bg-blue-600 text-white rounded-md">
                      <MousePointerClick className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-bold text-slate-900">Target Inspected</span>
                  </div>
                  {getCategoryBadge(selectedElement.category)}
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400">Element Label</label>
                    <p className="font-semibold text-slate-800">{selectedElement.text || selectedElement.name}</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase font-bold text-slate-400">CSS Selector</label>
                      <button
                        onClick={() => handleCopy(selectedElement.selector, 'css')}
                        className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-medium"
                      >
                        {copiedSelector === 'css' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {copiedSelector === 'css' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="font-mono text-[11px] bg-white p-1.5 rounded-md border border-blue-200/80 text-blue-950 truncate">
                      {selectedElement.selector}
                    </p>
                  </div>

                  {selectedElement.xpath && (
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] uppercase font-bold text-slate-400">XPath</label>
                        <button
                          onClick={() => handleCopy(selectedElement.xpath!, 'xpath')}
                          className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-medium"
                        >
                          {copiedSelector === 'xpath' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          {copiedSelector === 'xpath' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p className="font-mono text-[11px] bg-white p-1.5 rounded-md border border-blue-200/80 text-slate-700 truncate">
                        {selectedElement.xpath}
                      </p>
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      id="create-test-for-element-btn"
                      onClick={() => onCreateTestCaseFromScan(selectedElement)}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Create Test Case for this Element</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 bg-white border border-slate-200 rounded-xl text-center space-y-2 shadow-xs">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
                  <MousePointerClick className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-800">Click any element on the preview</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Inspect its CSS selector, XPath, interactive state, or generate a tailored test step sequence immediately.
                </p>
              </div>
            )}

            {/* DOM Elements Inventory */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>Detected Elements ({scannedPage.elements.length})</span>
                </h3>
              </div>

              {/* Search in elements */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by name or selector..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Category Pills */}
              <div className="flex flex-wrap gap-1">
                {(['all', 'action', 'input', 'navigation', 'content'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-1 text-[11px] rounded-md font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>

              {/* Element List */}
              <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1">
                {filteredElements.map((elem) => {
                  const isSelected = selectedElement?.id === elem.id;
                  return (
                    <div
                      key={elem.id}
                      onClick={() => setSelectedElement(elem)}
                      onMouseEnter={() => setHoveredElementId(elem.id)}
                      onMouseLeave={() => setHoveredElementId(undefined)}
                      className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-400 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800 truncate max-w-[170px]">
                          {elem.text || elem.name}
                        </span>
                        {getCategoryBadge(elem.category)}
                      </div>
                      <p className="text-[10px] font-mono text-slate-500 truncate mt-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                        {elem.selector}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Test Generation Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">AI Test Suite Auto-Generation</h3>
                  <p className="text-xs text-slate-500">Gemini models scan the DOM to create robust assertions</p>
                </div>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Test Scope & Strategy</label>
                <select
                  value={aiCategoryFocus}
                  onChange={(e) => setAiCategoryFocus(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Comprehensive E2E & Smoke">Comprehensive E2E & Smoke Suite</option>
                  <option value="Form Validation & Edge Cases">Form Validation & Negative Edge Cases</option>
                  <option value="Accessibility & ARIA Checks">Accessibility & ARIA State Compliance</option>
                  <option value="Checkout & Payment Flows">Checkout & Payment Critical Paths</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-800 block mb-1">Custom QA Guidance (Optional)</label>
                <textarea
                  rows={3}
                  value={aiCustomPrompt}
                  onChange={(e) => setAiCustomPrompt(e.target.value)}
                  placeholder="e.g. Ensure empty required fields show validation before submit..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 font-sans"
                />
              </div>

              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-start gap-2 text-[11px] text-blue-900">
                <Cpu className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  The generator will synthesize realistic step sequences, actions, inputs, and verify DOM selectors from this scan.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAiModal(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowAiModal(false);
                  await onAutoGenerateTestCases(aiCustomPrompt, aiCategoryFocus);
                }}
                disabled={isGeneratingAi}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate Test Suite</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
