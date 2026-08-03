'use client';

import { useState } from 'react';
import { Menu, X, Home, GitPullRequest, ShieldCheck, Settings, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ConnectButton from '@/components/ConnectButton';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigation = [
    { name: t('navigation.dashboard'), icon: Home, current: true },
    { name: t('navigation.validations'), icon: GitPullRequest, current: false },
    { name: t('navigation.tasks'), icon: ShieldCheck, current: false },
    { name: t('navigation.settings'), icon: Settings, current: false },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex transition-colors duration-200">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/30">
            <Shield className="w-6 h-6 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Vero</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Guardian</p>
          </div>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-4" aria-label={t('navigation.dashboard')}>
          {navigation.map((item) => (
            <a
              key={item.name}
              href="#"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                item.current
                  ? 'bg-indigo-50 dark:bg-indigo-600/10 text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
              {item.name}
            </a>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/50 backdrop-blur-sm sticky top-0 z-40">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between md:justify-end">
            <div className="flex items-center gap-3 md:hidden">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-900/30">
                <Shield className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <span className="font-bold text-slate-900 dark:text-white">Vero Guardian</span>
            </div>

            <div className="flex items-center gap-4">
              <ConnectButton />
              <button
                type="button"
                className="md:hidden p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={isMobileMenuOpen}
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <nav className="px-4 py-4 space-y-2" aria-label="Mobile navigation">
              {navigation.map((item) => (
                <a
                  key={item.name}
                  href="#"
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                    item.current
                      ? 'bg-indigo-50 dark:bg-indigo-600/10 text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <item.icon className="w-5 h-5" aria-hidden="true" />
                  {item.name}
                </a>
              ))}
            </nav>
          </div>
        )}

        {/* Page Content */}
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
