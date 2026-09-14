import { useEffect, useRef, useState } from 'react';
import type { Language } from '../lib/highlight';
import {
  csharpStatus,
  detectCapabilities,
  runCode,
  RunError,
  type Backend,
  type Capabilities,
  type RunLanguage,
  type RunOutcome,
} from '../lib/runner';

export type RunState =
  | { status: 'idle' }
  | { status: 'running'; backend: Backend }
  | { status: 'done'; outcome: RunOutcome; ranOriginal: boolean }
  | { status: 'error'; message: string };

let capabilityCache: Capabilities | null = null;

export function useCapabilities(): Capabilities | null {
  const [caps, setCaps] = useState<Capabilities | null>(capabilityCache);
  useEffect(() => {
    if (capabilityCache) return;
    let live = true;
    detectCapabilities().then((c) => {
      capabilityCache = c;
      if (live) setCaps(c);
    });
    return () => {
      live = false;
    };
  }, []);
  return caps;
}

export interface Runnable {
  language: RunLanguage;
  backend: Backend | null;
  original: string;
  code: string;
  setCode: (code: string) => void;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  modified: boolean;
  reset: () => void;
  state: RunState;
  run: () => void;
  dismiss: () => void;
  /** For C#: what the content checker found out about the original snippet. */
  csharp?: ReturnType<typeof csharpStatus>;
}

/** State for one runnable code block. Returns null for languages that can't run. */
export function useRunnable(language: RunLanguage, original: string): Runnable;
export function useRunnable(language: Language, original: string): Runnable | null;
export function useRunnable(language: Language, original: string): Runnable | null {
  const caps = useCapabilities();
  const [code, setCode] = useState(original);
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  if (language !== 'rust' && language !== 'csharp') return null;
  const backend = caps ? caps[language] : null;

  const run = () => {
    if (!backend) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const ranOriginal = code === original;
    setState({ status: 'running', backend });
    runCode(language, code, backend, controller.signal)
      .then((outcome) => setState({ status: 'done', outcome, ranOriginal }))
      .catch((e: Error) => {
        if (e.name === 'AbortError') return;
        setState({ status: 'error', message: e instanceof RunError ? e.message : `Run failed: ${e.message}` });
      });
  };

  return {
    language,
    backend,
    original,
    code,
    setCode,
    editing,
    setEditing,
    modified: code !== original,
    reset: () => setCode(original),
    state,
    run,
    dismiss: () => setState({ status: 'idle' }),
    csharp: language === 'csharp' ? csharpStatus(original) : undefined,
  };
}

