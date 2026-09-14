import { Inline } from '../components/Prose';
import { allDrills } from '../content/drills';
import { tracks } from '../content/tracks';
import { href } from '../lib/router';
import { useProgress } from '../lib/storage';
import { NotFound } from './NotFound';

export function TrackPage({ trackId }: { trackId: string }) {
  const track = tracks.find((t) => t.id === trackId);
  const { read } = useProgress();
  if (!track || track.status !== 'available') return <NotFound />;
  const trackDrills = allDrills.filter((d) => d.track === track.id);

  return (
    <div className="mx-auto max-w-[860px] px-4 py-10 sm:px-6 lg:py-14">
      <p className="font-mono text-[13px] text-muted">Stuck point {track.order} of 6</p>
      <h1 className="mt-2 font-mono text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-strong">{track.title}</h1>
      <p className="mt-4 max-w-[62ch] text-[1.05rem]">
        <Inline text={track.pitch} />
      </p>
      <p className="mt-3 max-w-[62ch] text-muted">
        Each lesson has the same shape: the C# you already write, the Rust equivalent side by side, then where the analogy
        breaks. The last part is the point.
      </p>
      {trackDrills.length > 0 && (
        <p className="mt-3 text-[0.95rem]">
          <a href={href.drills()} className="text-text underline decoration-oxide underline-offset-4">
            {trackDrills.length} error drills
          </a>{' '}
          <span className="text-muted">go with this track.</span>
        </p>
      )}

      <ol className="mt-10 divide-y divide-rule border-y border-rule">
        {track.lessons.map((l, i) => (
          <li key={l.id}>
            <a href={href.lesson(track.id, l.id)} className="group grid grid-cols-[2.5rem_1fr] gap-x-2 py-5 hover:bg-surface sm:grid-cols-[2.5rem_1fr_auto]">
              <span className="pl-1 font-mono text-[1rem] text-muted">{i + 1}</span>
              <span>
                <span className="font-mono text-[1.05rem] font-medium text-strong group-hover:underline group-hover:decoration-oxide group-hover:underline-offset-4">
                  {l.title}
                </span>
                <span className="mt-1 block max-w-[60ch] text-[0.95rem] text-muted">
                  <Inline text={l.summary} />
                </span>
              </span>
              <span className="col-start-2 mt-2 font-mono text-[12px] text-muted sm:col-start-3 sm:mt-1 sm:pr-2">
                {read.has(l.id) ? <span className="text-verdigris">read</span> : null}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
