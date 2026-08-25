import React from 'react';
import {
  Scan, Layers, Play, FileCode, CheckCircle2, ShieldAlert,
  Sparkles, Terminal, Activity, ArrowRight, Compass, Settings,
  CheckCircle, Database, LayoutGrid, Menu, X, User, GitFork,
  LogOut, ChevronUp, ChevronDown
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useLogout } from '@/features/auth/hooks/use-auth';
interface NavbarProps {
  activeTab: 'scanner' | 'builder' | 'runner' | 'suite' | 'repos';
  onSelectTab: (tab: 'scanner' | 'builder' | 'runner' | 'suite' | 'repos') => void;
  scannedCount?: number;
  testCasesCount: number;
  hasActiveTestToRun: boolean;
  activeUrl?: string;
  onChangeSourceClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  scannedCount = 0,
  testCasesCount,
  hasActiveTestToRun,
  activeUrl = 'https://app.cloudscale.io/login',
  onChangeSourceClick,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { logout } = useLogout();

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getTabLabel = (tab: typeof activeTab) => {
    switch (tab) {
      case 'scanner': return 'Interface Scanner';
      case 'builder': return 'Test Case Builder';
      case 'runner': return 'Test Runner (Live)';
      case 'suite': return 'Test Repository';
      case 'repos': return 'GitHub Repositories';
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name) return 'QA';
    return name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden bg-[#0F172A] border-b border-slate-800 px-4 py-3 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-md shadow-blue-500/20">
            QA
          </div>
          <div>
            <span className="font-bold text-white text-sm tracking-tight">TestFlow AI</span>
            <span className="ml-2 text-[10px] text-blue-400 font-mono font-medium">v2.4</span>
          </div>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#0F172A] border-b border-slate-800 p-4 space-y-1 z-30 shrink-0">
          <button
            onClick={() => { onSelectTab('scanner'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium ${activeTab === 'scanner' ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25' : 'text-slate-300'
              }`}
          >
            <div className="flex items-center gap-2.5">
              <Scan className="w-4 h-4 text-blue-400" />
              <span>1. Interface Scanner</span>
            </div>
            {scannedCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-blue-300">
                {scannedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { onSelectTab('builder'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium ${activeTab === 'builder' ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25' : 'text-slate-300'
              }`}
          >
            <div className="flex items-center gap-2.5">
              <FileCode className="w-4 h-4 text-slate-400" />
              <span>2. Test Case Builder</span>
            </div>
          </button>

          <button
            onClick={() => { onSelectTab('runner'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium ${activeTab === 'runner' ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25' : 'text-slate-300'
              }`}
          >
            <div className="flex items-center gap-2.5">
              <Play className="w-4 h-4 text-emerald-400" />
              <span>3. Live Test Runner</span>
            </div>
            {hasActiveTestToRun && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => { onSelectTab('suite'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium ${activeTab === 'suite' ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25' : 'text-slate-300'
              }`}
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Test Repository</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              {testCasesCount}
            </span>
          </button>

          <button
            onClick={() => { onSelectTab('repos'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium ${activeTab === 'repos' ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25' : 'text-slate-300'
              }`}
          >
            <div className="flex items-center gap-2.5">
              <GitFork className="w-4 h-4 text-purple-400" />
              <span>GitHub Repositories</span>
            </div>
          </button>

          {/* Mobile User & Logout Section */}
          <div className="pt-3 mt-3 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-xs font-bold text-blue-300 shrink-0">
                {getInitials(user?.name)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">{user?.name || 'QA Workspace'}</p>
                <p className="text-[10px] text-slate-400 font-mono truncate">{user?.email || (user?.githubLogin ? `@${user.githubLogin}` : 'Online')}</p>
              </div>
            </div>
            <button
              id="mobile-logout-btn"
              onClick={() => {
                setMobileMenuOpen(false);
                logout();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors border border-rose-500/20"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}

      {/* Desktop Professional Dark Sidebar */}
      <aside className="hidden md:flex w-64 bg-[#0F172A] flex-col border-r border-slate-800 shrink-0 text-white select-none">
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-500/30">
              QA
            </div>
            <div>
              <h1 className="font-semibold text-white text-base tracking-tight leading-none">TestFlow AI</h1>
              <p className="text-[10px] text-slate-400 font-mono tracking-wider uppercase mt-1">Automated Testing</p>
            </div>
          </div>
        </div>

        {/* Sidebar Nav */}
        <div className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-mono font-bold tracking-wider uppercase text-slate-500">
            Workflows
          </div>

          <button
            id="sidebar-scanner-tab"
            onClick={() => onSelectTab('scanner')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'scanner'
              ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25 shadow-xs font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
          >
            <div className="flex items-center gap-3">
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'scanner' ? 'bg-blue-400 shadow-xs shadow-blue-400' : 'bg-slate-600'}`} />
              <Scan className="w-4 h-4" />
              <span>1. Interface Scanner</span>
            </div>
            {scannedCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-blue-300 border border-slate-700">
                {scannedCount}
              </span>
            )}
          </button>

          <button
            id="sidebar-builder-tab"
            onClick={() => onSelectTab('builder')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'builder'
              ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25 shadow-xs font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
          >
            <div className="flex items-center gap-3">
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'builder' ? 'bg-blue-400 shadow-xs shadow-blue-400' : 'bg-slate-600'}`} />
              <FileCode className="w-4 h-4" />
              <span>2. Test Case Builder</span>
            </div>
          </button>

          <button
            id="sidebar-runner-tab"
            onClick={() => onSelectTab('runner')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'runner'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-xs font-semibold'
              : (hasActiveTestToRun ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60')
              }`}
          >
            <div className="flex items-center gap-3">
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'runner' ? 'bg-emerald-400 shadow-xs shadow-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <Play className="w-4 h-4" />
              <span>3. Live Test Runner</span>
            </div>
            {hasActiveTestToRun && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>

          <button
            id="sidebar-suite-tab"
            onClick={() => onSelectTab('suite')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'suite'
              ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25 shadow-xs font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
          >
            <div className="flex items-center gap-3">
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'suite' ? 'bg-blue-400 shadow-xs shadow-blue-400' : 'bg-slate-600'}`} />
              <Layers className="w-4 h-4" />
              <span>Test Repository</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {testCasesCount}
            </span>
          </button>

          <button
            id="sidebar-repos-tab"
            onClick={() => onSelectTab('repos')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'repos'
              ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25 shadow-xs font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
          >
            <div className="flex items-center gap-3">
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'repos' ? 'bg-blue-400 shadow-xs shadow-blue-400' : 'bg-slate-600'}`} />
              <GitFork className="w-4 h-4 text-purple-400" />
              <span>GitHub Repositories</span>
            </div>
          </button>

          {/* Quick Metrics Section */}
          <div className="pt-6">
            <div className="px-3 pb-2 text-[10px] font-mono font-bold tracking-wider uppercase text-slate-500">
              Session Insights
            </div>
            <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>DOM Nodes</span>
                <span className="font-mono text-slate-200 font-semibold">{scannedCount} detected</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Test Cases</span>
                <span className="font-mono text-slate-200 font-semibold">{testCasesCount} saved</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Engine</span>
                <span className="font-mono text-emerald-400 font-semibold">Ready (v2.4)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Footer User Section with Dropdown */}
        <div className="relative p-3 border-t border-slate-800 bg-[#0B1120]" ref={dropdownRef}>
          {/* Dropdown Menu Popover */}
          {userDropdownOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 bg-[#1E293B] border border-slate-700/80 rounded-xl shadow-2xl p-2 z-50 animate-fadeIn space-y-1">
              <div className="px-3 py-2.5 border-b border-slate-700/60">
                <p className="text-xs font-semibold text-white truncate">{user?.name || 'QA Workspace'}</p>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">{user?.email || 'No email attached'}</p>
                {user?.githubLogin && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-purple-400 font-mono">
                    <GitFork className="w-3 h-3" />
                    <span>@{user.githubLogin}</span>
                  </div>
                )}
              </div>
              <button
                id="navbar-logout-btn"
                onClick={() => {
                  setUserDropdownOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          )}

          {/* User Profile Card */}
          <div
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-xs font-bold text-blue-300 shrink-0">
                {getInitials(user?.name)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">{user?.name || 'QA Workspace'}</p>
                <p className="text-[10px] text-slate-400 font-mono truncate">{user?.email || (user?.githubLogin ? `@${user.githubLogin}` : 'Online')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400" title="Online" />
              {userDropdownOpen ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
