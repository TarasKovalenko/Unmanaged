import { useMemo } from 'react';
import { Inline } from '../components/Prose';
import { errorCodes } from '../content/errors';
import { plural } from '../lib/format';
import { href } from '../lib/router';
import { buildErrorIndex } from '../lib/searchIndex';

const KIND_LABEL = { snippet: 'visualizer', drill: 'drill', gotcha: 'gotcha' } as const;

/** Panics are runtime failures, not compiler errors, so they get a different colour. */
const codeColour = (code: string) => (code === 'panic' ? 'text-ochre' : 'text-danger');

export function ErrorsPage({ code }: { code?: string }) {
  const index = useMemo(() => buildErrorIndex(), []);
  const selected = code ? index.find((e) => e.code.toLowerCase() === code.toLowerCase()) : undefined;

  return (
    <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:py-12">
      <aside>
        <h1 className="font-mono text-[1.35rem] font-semibold tracking-[-0.02em] text-strong">Error index</h1>
        <p className="mt-2 text-[0.92rem] text-muted">
          Every rustc error code used on this site, and where to see it happen. {plural(index.length, 'code')}.
        </p>
        <ul className="mt-5 space-y-px">
          {index.map((e) => {
            const current = selected?.code === e.code;
            return (
              <li key={e.code}>
                <a
                  href={href.errors(e.code)}
                  aria-current={current ? 'page' : undefined}
                  className={`grid grid-cols-[3.6rem_1fr_auto] gap-x-2 rounded-[3px] px-2 py-1.5 text-[0.88rem] leading-snug ${
                    current ? 'bg-raised text-strong' : 'text-muted hover:bg-surface hover:text-text'
                  }`}
                >
                  <span className={`font-mono text-[12px] ${e.code === 'panic' ? 'text-ochre' : 'text-danger/90'}`}>{e.code}</span>
                  <span>{errorCodes[e.code]?.title ?? 'Compiler error'}</span>
                  <span className="font-mono text-[11px] text-muted/70">{e.items.length}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="min-w-0">
        {selected ? (
          <article>
            <p className={`font-mono text-[13px] ${codeColour(selected.code)}`}>{selected.code}</p>
            <h2 className="mt-1 font-mono text-[1.8rem] font-semibold leading-tight tracking-[-0.03em] text-strong">
              {errorCodes[selected.code]?.title ?? 'Compiler error'}
            </h2>
            {errorCodes[selected.code] && (
              <p className="mt-3 max-w-[68ch] text-[1.03rem]">
                <Inline text={errorCodes[selected.code].gist} />
              </p>
            )}
            {selected.code !== 'panic' && (
              <p className="mt-3 text-[0.92rem] text-muted">
                Official explanation:{' '}
                <a
                  href={`https://doc.rust-lang.org/error_codes/${selected.code}.html`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-text underline decoration-rule-strong underline-offset-4"
                >
                  rustc --explain {selected.code}
                </a>
              </p>
            )}
            <h3 className="mt-10 font-mono text-[1rem] font-medium text-strong">See it here</h3>
            <ul className="mt-3 divide-y divide-rule border-y border-rule">
              {selected.items.map((it, i) => (
                <li key={i}>
                  <a href={it.to} className="grid gap-x-4 gap-y-1 px-1 py-3 hover:bg-surface sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span className="font-mono text-[12px] text-muted">{KIND_LABEL[it.kind]}</span>
                    <span className="min-w-0">
                      <span className="text-strong">{it.title}</span>
                      {it.firstLine && <span className="mt-0.5 block truncate font-mono text-[12px] text-muted">{it.firstLine}</span>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </article>
        ) : (
          <div className="max-w-[68ch]">
            <h2 className="font-mono text-[1.4rem] font-medium text-strong">{code ? `${code} is not used on this site yet` : 'Pick a code'}</h2>
            <p className="mt-3 text-muted">
              The codes on the left are the ones C# developers meet most in their first months. Each links to a visualizer, a
              drill or a gotcha card where it happens for real.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {index.slice(0, 8).map((e) => (
                <a key={e.code} href={href.errors(e.code)} className="rounded-[4px] border border-rule px-4 py-3 hover:bg-surface">
                  <span className={`font-mono text-[13px] ${codeColour(e.code)}`}>{e.code}</span>
                  <span className="mt-1 block text-[0.93rem] text-text">{errorCodes[e.code]?.title ?? 'Compiler error'}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
