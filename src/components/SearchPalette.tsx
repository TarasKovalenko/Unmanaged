import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../lib/router';
import { search, type SearchKind } from '../lib/searchIndex';

const KIND_LABEL: Record<SearchKind, string> = {
  lesson: 'lesson',
  snippet: 'visualizer',
  drill: 'drill',
  gotcha: 'gotcha',
  phrase: 'phrasebook',
  project: 'project',
  error: 'error code',
  timeline: 'timeline',
};

/** Ctrl/Cmd-K search across lessons, snippets, drills, gotchas, phrasebook, projects and error codes. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const results = useMemo(() => search(query), [query]);

  useEffect(() => {
    // The dialog is always rendered, so the ref is set by the time effects run.
    const d = dialogRef.current!;
    if (open && !d.open) {
      d.showModal();
      inputRef.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  function close() {
    setQuery('');
    setActive(0);
    onClose();
  }

  function go(i: number) {
    const r = results[i];
    if (!r) return;
    close();
    navigate(r.to);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={close}
      onClick={(e) => {
        if (e.target === dialogRef.current) close();
      }}
      aria-label="Search"
      className="m-0 mx-auto mt-[10vh] w-[min(680px,calc(100vw-32px))] max-w-none rounded-[6px] border border-rule-strong bg-surface p-0 text-text backdrop:bg-black/60"
    >
      <div className="border-b border-rule p-3">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              go(active);
            }
          }}
          placeholder="Search lessons, error codes, gotchas, C# APIs…"
          aria-controls="search-results"
          aria-activedescendant={results[active] ? `search-result-${active}` : undefined}
          className="w-full bg-transparent px-2 py-1.5 font-mono text-[15px] text-strong outline-none placeholder:text-muted/70"
        />
      </div>
      <ul id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-1.5">
        {query && results.length === 0 && <li className="px-3 py-6 text-center text-muted">Nothing matches. Try an error code like E0502, or a C# name like FirstOrDefault.</li>}
        {!query && (
          <li className="px-3 py-4 text-[0.9rem] text-muted">
            Try <code className="font-mono text-text">E0382</code>, <code className="font-mono text-text">IDisposable</code>,{' '}
            <code className="font-mono text-text">RefCell</code> or <code className="font-mono text-text">overflow</code>.
          </li>
        )}
        {results.map((r, i) => (
          <li
            key={`${r.kind}-${r.to}-${i}`}
            id={`search-result-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onClick={() => go(i)}
            className={`grid cursor-pointer grid-cols-[6.5rem_1fr] gap-3 rounded-[4px] px-3 py-2 ${i === active ? 'bg-raised' : ''}`}
          >
            <span className="pt-0.5 font-mono text-[11.5px] text-muted">{KIND_LABEL[r.kind]}</span>
            <span className="min-w-0">
              <span className="block truncate font-mono text-[13.5px] text-strong">{r.title}</span>
              <span className="block truncate text-[0.85rem] text-muted">{r.subtitle.replace(/[`*]/g, '')}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between border-t border-rule px-4 py-2 font-mono text-[11px] text-muted">
        <span>↑↓ to move, Enter to open</span>
        <span>Esc to close</span>
      </div>
    </dialog>
  );
}
