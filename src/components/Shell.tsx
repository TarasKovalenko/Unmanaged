import { useEffect, useState, type ReactNode } from 'react';
import { href, type Route } from '../lib/router';
import { useTheme } from '../lib/storage';
import { useCapabilities } from './useRunnable';
import { SearchPalette } from './SearchPalette';

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const caps = useCapabilities();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const nav = [
    { label: 'Tracks', to: href.home(), on: route.page === 'home' || route.page === 'track' || route.page === 'lesson' },
    { label: 'Visualizer', to: href.visualizer(), on: route.page === 'visualizer' },
    { label: 'Drills', to: href.drills(), on: route.page === 'drills' },
    { label: 'Gotchas', to: href.gotchas(), on: route.page === 'gotchas' },
    { label: 'Phrasebook', to: href.phrasebook(), on: route.page === 'phrasebook' },
    { label: 'Projects', to: href.projects(), on: route.page === 'projects' || route.page === 'project' },
    { label: 'Errors', to: href.errors(), on: route.page === 'errors' },
  ];
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-20 focus:bg-surface focus:px-3 focus:py-1">
        Skip to content
      </a>
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 pt-3 sm:px-6 lg:py-3">
          <a href={href.home()} className="flex shrink-0 items-baseline gap-3">
            <span className="font-mono text-[1.05rem] font-semibold tracking-[-0.02em] text-strong">
              <span className="text-oxide-text">&amp;</span>unmanaged
            </span>
            <span className="hidden text-[0.85rem] text-muted xl:inline">Rust for people who write C#</span>
          </a>
          <nav aria-label="Primary" className="hidden items-center gap-0.5 font-mono text-[13px] lg:flex">
            {nav.map((n) => (
              <a
                key={n.label}
                href={n.to}
                aria-current={n.on ? 'page' : undefined}
                className={`rounded-[3px] px-2.5 py-1 ${n.on ? 'bg-raised text-strong' : 'text-muted hover:text-text'}`}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2 font-mono text-[13px]">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-[3px] border border-rule px-2 py-1 text-muted hover:text-text"
              aria-label="Search"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="m11 11 4 4" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded-[2px] border border-rule px-1 text-[11px] sm:inline">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
            </button>
            <button
              type="button"
              onClick={toggle}
              className="rounded-[3px] border border-rule px-2 py-1 text-muted hover:text-text"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
        {/* Narrow screens: the section nav scrolls horizontally instead of collapsing behind a menu. */}
        <nav aria-label="Primary" className="mx-auto flex max-w-[1400px] gap-0.5 overflow-x-auto px-3 py-2 font-mono text-[13px] lg:hidden">
          {nav.map((n) => (
            <a
              key={n.label}
              href={n.to}
              aria-current={n.on ? 'page' : undefined}
              className={`shrink-0 rounded-[3px] px-2.5 py-1 ${n.on ? 'bg-raised text-strong' : 'text-muted hover:text-text'}`}
            >
              {n.label}
            </a>
          ))}
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1400px] flex-wrap justify-between gap-x-8 gap-y-2 px-4 py-5 text-[0.85rem] text-muted sm:px-6">
          <span>
            Outputs shown in lessons were verified ahead of time with rustc and .NET.{' '}
            {caps === null
              ? ''
              : caps.csharp === 'runner'
                ? 'Run buttons use the code runner (Rust and C#).'
                : caps.rust === 'playground'
                  ? 'Run buttons send Rust to play.rust-lang.org; C# needs the code runner.'
                  : 'Running code is not available here.'}
          </span>
          <a href={href.about()} className="underline decoration-rule-strong underline-offset-4 hover:text-text">
            About and limitations
          </a>
        </div>
      </footer>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
