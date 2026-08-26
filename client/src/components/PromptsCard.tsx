'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  FileCode,
  Layers,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { streamGithubScan } from '@/features/github-scan/stream';

export type PredefinedPrompt = {
  id: string;
  title: string;
  category: string;
  badge: string;
  description: string;
  prompt: string;
  icon: 'shield' | 'sparkles' | 'layers' | 'workflow' | 'zap' | 'fileCode';
};

export const DEFAULT_PROMPTS: PredefinedPrompt[] = [
  {
    id: 'auth-flows',
    title: 'Authentication & Session Flow',
    category: 'Auth & Security',
    badge: 'Essential',
    icon: 'shield',
    description: 'Registration validation, credentials check, session state, and route protection.',
    prompt:
      'Generate end-to-end Playwright tests for complete user authentication:\n' +
      '1. User registration with field validation (email format, password requirements)\n' +
      '2. Login with valid credentials and error messages for invalid credentials\n' +
      '3. Session token handling, cookie/localStorage persistence, and redirect\n' +
      '4. Protected route guard testing (unauthenticated redirect to login)\n' +
      '5. Logout flow and secure session cleanup',
  },
  {
    id: 'core-journey',
    title: 'Core E2E User Journey',
    category: 'End-to-End',
    badge: 'Recommended',
    icon: 'sparkles',
    description: 'Primary customer journey from landing page to transaction/action completion.',
    prompt:
      'Analyze and generate test scenarios for the primary user journey of this app:\n' +
      '1. Initial landing page discovery and primary call-to-actions\n' +
      '2. Search, browse, and item/resource selection workflow\n' +
      '3. Form submission or checkout multi-step progress\n' +
      '4. Final confirmation screen and status verification',
  },
  {
    id: 'crud-dashboard',
    title: 'Dashboard & CRUD Operations',
    category: 'Data Management',
    badge: 'Popular',
    icon: 'layers',
    description: 'Create, Read, Update, and Delete actions with list filtering and pagination.',
    prompt:
      'Test dashboard data management workflows across main entities:\n' +
      '1. Creating new items via modals or dedicated forms with input validation\n' +
      '2. Table/grid list rendering, search query filtering, and page navigation\n' +
      '3. Inline and modal-based editing of existing records\n' +
      '4. Deleting records with confirmation dialogs and optimistic UI updates',
  },
  {
    id: 'form-validation',
    title: 'Form Validation & Edge Cases',
    category: 'Quality & Edge Cases',
    badge: 'Reliability',
    icon: 'fileCode',
    description: 'Boundary inputs, required checks, invalid formats, and inline error banners.',
    prompt:
      'Cover comprehensive form validation rules and edge cases across interactive inputs:\n' +
      '1. Empty required field submission warnings\n' +
      '2. Boundary value inputs (minimum/maximum length, special characters)\n' +
      '3. Dynamic input formatting (phone numbers, currency, emails)\n' +
      '4. Clear error messages and accessibility feedback states',
  },
  {
    id: 'api-resilience',
    title: 'API Mocking & Error Resilience',
    category: 'Integration',
    badge: 'Advanced',
    icon: 'zap',
    description: 'Mocked API responses, network failures (401, 500), and offline resilience.',
    prompt:
      'Test UI behavior under varied backend API conditions using page.route() mocks:\n' +
      '1. Successful responses (200 OK) with mock payload fixtures\n' +
      '2. Server errors (500 Internal Server Error) and client errors (400/404)\n' +
      '3. Delayed responses showing loading skeletons and spinners\n' +
      '4. Network failure/timeout handling and retry banners',
  },
  {
    id: 'navigation-layout',
    title: 'Navigation & Responsive UX',
    category: 'UI & Routing',
    badge: 'Coverage',
    icon: 'workflow',
    description: 'Header, sidebar navigation, responsive mobile drawer, and breadcrumbs.',
    prompt:
      'Verify application navigation hierarchy and layout responsiveness:\n' +
      '1. Top navigation bar and sidebar links routing\n' +
      '2. Mobile hamburger menu and drawer toggles\n' +
      '3. Breadcrumb navigation and back button behavior\n' +
      '4. Active state styling on current route',
  },
];

export const PREDEFINED_PROMPTS = DEFAULT_PROMPTS;

function parsePromptsJson(raw: string): PredefinedPrompt[] | null {
  if (!raw.trim()) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: Partial<PredefinedPrompt>, idx: number) => ({
          id: item.id || `prompt-${idx}`,
          title: item.title || `Test Scenario ${idx + 1}`,
          category: item.category || 'Discovered Flows',
          badge: item.badge || 'AI Detected',
          icon: (['shield', 'sparkles', 'layers', 'workflow', 'zap', 'fileCode'].includes(item.icon || '')
            ? item.icon
            : 'sparkles') as PredefinedPrompt['icon'],
          description: item.description || '',
          prompt: item.prompt || '',
        }));
      }
    } catch {
      // not yet fully parsed
    }
  }
  return null;
}

interface PromptsCardProps {
  repo?: string;
  selectedPresetId?: string | null;
  onSelectPreset: (preset: PredefinedPrompt) => void;
}

export function PromptsCard({ repo = '', selectedPresetId, onSelectPreset }: PromptsCardProps) {
  const [prompts, setPrompts] = useState<PredefinedPrompt[]>(DEFAULT_PROMPTS);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scannedRepoRef = useRef<string>('');

  const scanRepoForPrompts = async (targetRepo: string) => {
    if (!targetRepo || !targetRepo.includes('/')) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setStatus('scanning');
    setErrorMessage('');

    try {
      let accumulated = '';
      const text = await streamGithubScan(
        { repo: targetRepo, mode: 'suggest-prompts' },
        (chunk) => {
          accumulated = chunk;
          const parsed = parsePromptsJson(accumulated);
          if (parsed && parsed.length > 0) {
            setPrompts(parsed);
          }
        },
        abort.signal,
      );

      const finalParsed = parsePromptsJson(text);
      if (finalParsed && finalParsed.length > 0) {
        setPrompts(finalParsed);
        scannedRepoRef.current = targetRepo;
        setStatus('success');
      } else {
        setStatus('idle');
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Prompt scan failed');
    }
  };

  useEffect(() => {
    if (repo && repo.includes('/') && repo !== scannedRepoRef.current) {
      void scanRepoForPrompts(repo);
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [repo]);

  const categories = ['All', ...Array.from(new Set(prompts.map((p) => p.category)))];

  const filteredPrompts =
    selectedCategory === 'All'
      ? prompts
      : prompts.filter((p) => p.category === selectedCategory);

  const getIcon = (type: PredefinedPrompt['icon']) => {
    switch (type) {
      case 'shield':
        return <ShieldCheck className="w-4 h-4 text-indigo-600" />;
      case 'sparkles':
        return <Sparkles className="w-4 h-4 text-amber-600" />;
      case 'layers':
        return <Layers className="w-4 h-4 text-emerald-600" />;
      case 'fileCode':
        return <FileCode className="w-4 h-4 text-blue-600" />;
      case 'zap':
        return <Zap className="w-4 h-4 text-purple-600" />;
      case 'workflow':
        return <Workflow className="w-4 h-4 text-cyan-600" />;
      default:
        return <Sparkles className="w-4 h-4 text-indigo-600" />;
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Predefined Test Prompts
            </h2>
            {status === 'scanning' && (
              <span className="text-[11px] font-medium px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200 flex items-center gap-1.5 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                Scanning repo for custom prompts…
              </span>
            )}
            {status === 'success' && (
              <span className="text-[11px] font-medium px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" />
                Tailored for {repo}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {status === 'success'
              ? `AI-extracted prompt scenarios specifically discovered for ${repo}. Click one to load it.`
              : 'Choose a ready-to-use QA prompt template tailored for your repository, or customize your own below.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {repo && repo.includes('/') && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={status === 'scanning'}
              onClick={() => void scanRepoForPrompts(repo)}
              className="text-xs h-8 text-slate-600 hover:text-slate-900"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${status === 'scanning' ? 'animate-spin text-indigo-600' : ''}`}
              />
              {status === 'scanning' ? 'Scanning Repo…' : 'Scan Repo for Prompts'}
            </Button>
          )}

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {status === 'error' && errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center justify-between">
          <span>Failed to scan repo for prompts: {errorMessage}. Using fallback templates.</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void scanRepoForPrompts(repo)}
            className="text-rose-700 hover:bg-rose-100 text-xs h-7"
          >
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredPrompts.map((preset) => {
          const isSelected = selectedPresetId === preset.id;
          return (
            <div
              key={preset.id}
              onClick={() => onSelectPreset(preset)}
              className={`relative p-4 rounded-xl border text-left cursor-pointer transition-all duration-200 flex flex-col justify-between group ${
                isSelected
                  ? 'bg-indigo-50/50 border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 bg-slate-100 rounded-md group-hover:bg-indigo-100 transition-colors shrink-0">
                      {getIcon(preset.icon)}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                      {preset.title}
                    </h3>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wider shrink-0">
                    {preset.badge}
                  </span>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                  {preset.description}
                </p>
              </div>

              <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">
                  {preset.category}
                </span>
                <span
                  className={`text-xs font-semibold flex items-center gap-1 ${
                    isSelected ? 'text-indigo-600' : 'text-slate-600 group-hover:text-indigo-600'
                  }`}
                >
                  {isSelected ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Selected
                    </>
                  ) : (
                    <>
                      Use Prompt <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
