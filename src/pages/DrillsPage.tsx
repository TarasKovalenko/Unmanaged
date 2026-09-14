import { useMemo, useState } from 'react';
import { DrillCard } from '../components/DrillCard';
import { allDrills, drillById } from '../content/drills';
import { tracks } from '../content/tracks';
import { href, navigate } from '../lib/router';
import { useDrillAttempts } from '../lib/storage';

type Status = 'all' | 'new' | 'missed' | 'solved';

export function DrillsPage({ drillId }: { drillId?: string }) {
  const { attempts } = useDrillAttempts();
  const [track, setTrack] = useState<string>('all');
  const [status, setStatus] = useState<Status>('all');

  const visible = useMemo(
    () =>
      allDrills.filter((d) => {
        if (track !== 'all' && d.track !== track) return false;
        const a = attempts[d.id];
        if (status === 'new') return !a;
        if (status === 'missed') return a && !a.correctFirstTry;
        if (status === 'solved') return a?.correctFirstTry;
        return true;
      }),
    [track, status, attempts],
  );

  const selected = (drillId && drillById.get(drillId)) || visible[0] || allDrills[0];
  const tried = Object.keys(attempts).filter((id) => drillById.has(id));
  const missed = tried.filter((id) => !attempts[id].correctFirstTry).length;
  const tracksWithDrills = tracks.filter((t) => allDrills.some((d) => d.track === t.id));

  if (!selected) {
    return <div className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">No drills have been written yet.</div>;
  }

  // A drill is selected, so allDrills (and therefore the pool) is never empty.
  const pool = visible.length ? visible : allDrills;
  const nextId = pool[(pool.findIndex((d) => d.id === selected.id) + 1) % pool.length].id;

  return (
    <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[270px_minmax(0,1fr)] lg:py-12">
      <aside>
        <h1 className="font-mono text-[1.35rem] font-semibold tracking-[-0.02em] text-strong">Error drills</h1>
        <p className="mt-2 text-[0.92rem] text-muted">
          Read the error, commit to a diagnosis, then compare fixes. {allDrills.length} drills;
          {tried.length ? ` you have tried ${tried.length}, and ${missed} are worth another look.` : ' none tried yet.'}
        </p>

        <label className="mt-5 block">
          <span className="mb-1 block font-mono text-[12px] text-muted">Track</span>
          <select
            value={track}
            onChange={(e) => setTrack(e.target.value)}
            className="w-full rounded-[3px] border border-rule bg-surface px-2 py-1.5 font-mono text-[13px] text-text"
          >
            <option value="all">All tracks</option>
            {tracksWithDrills.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>

        <div role="radiogroup" aria-label="Filter by status" className="mt-3 grid grid-cols-4 rounded-[3px] border border-rule font-mono text-[12px]">
          {(
            [
              ['all', 'All'],
              ['new', 'New'],
              ['missed', 'Missed'],
              ['solved', 'Solved'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={status === k}
              onClick={() => setStatus(k)}
              className={`px-1 py-1.5 ${status === k ? 'bg-raised text-strong' : 'text-muted hover:text-text'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-4 block lg:hidden">
          <span className="sr-only">Drill</span>
          <select
            value={selected.id}
            onChange={(e) => navigate(href.drills(e.target.value))}
            className="w-full rounded-[3px] border border-rule bg-surface px-2 py-2 font-mono text-[13px] text-text"
          >
            {(visible.some((d) => d.id === selected.id) ? visible : [selected, ...visible]).map((d) => (
              <option key={d.id} value={d.id}>
                {d.errorCode} {d.title}
              </option>
            ))}
          </select>
        </label>

        <ul className="mt-4 hidden space-y-px lg:block">
          {visible.length === 0 && <li className="px-2 py-2 text-[0.9rem] text-muted">Nothing matches this filter.</li>}
          {visible.map((d) => {
            const current = d.id === selected.id;
            const a = attempts[d.id];
            return (
              <li key={d.id}>
                <a
                  href={href.drills(d.id)}
                  aria-current={current ? 'page' : undefined}
                  className={`grid grid-cols-[3.6rem_1fr] gap-x-2 rounded-[3px] px-2 py-1.5 text-[0.88rem] leading-snug ${
                    current ? 'bg-raised text-strong' : 'text-muted hover:bg-surface hover:text-text'
                  }`}
                >
                  <span className={`font-mono text-[11.5px] ${d.outcome === 'panic' ? 'text-ochre' : 'text-danger/90'}`}>{d.errorCode}</span>
                  <span>
                    {d.title}
                    {a && (
                      <span className={`ml-1.5 font-mono text-[11px] ${a.correctFirstTry ? 'text-verdigris' : 'text-ochre'}`}>
                        {a.correctFirstTry ? 'solved' : 'missed'}
                      </span>
                    )}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="min-w-0">
        <DrillCard key={selected.id} drill={selected} headingLevel={2} onNext={() => navigate(href.drills(nextId))} />
      </div>
    </div>
  );
}
