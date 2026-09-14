import { useEffect } from 'react';
import { BorrowVisualizer } from '../components/BorrowVisualizer';
import { CodeBlock } from '../components/CodeLine';
import { ComparePanes } from '../components/ComparePanes';
import { DrillCard } from '../components/DrillCard';
import { Inline, Prose } from '../components/Prose';
import { TimelineView } from '../components/TimelineView';
import { snippetById } from '../content/borrow';
import { drillById } from '../content/drills';
import { timelineById } from '../content/timelines';
import { tracks } from '../content/tracks';
import { href } from '../lib/router';
import { useDrillAttempts, useProgress } from '../lib/storage';
import { NotFound } from './NotFound';

export function LessonPage({ trackId, lessonId }: { trackId: string; lessonId: string }) {
  const track = tracks.find((t) => t.id === trackId);
  const index = track?.lessons.findIndex((l) => l.id === lessonId) ?? -1;
  const lesson = track?.lessons[index];
  const { read, setRead, visit } = useProgress();
  const { attempts } = useDrillAttempts();

  useEffect(() => {
    if (track && lesson) visit(track.id, lesson.id);
  }, [track, lesson, visit]);

  if (!track || !lesson) return <NotFound />;
  const next = track.lessons[index + 1];
  const nextTrack = tracks.slice(tracks.indexOf(track) + 1).find((t) => t.status === 'available');
  const isRead = read.has(lesson.id);
  const timelines = (lesson.timelines ?? []).map((id) => timelineById.get(id)).filter((t) => t !== undefined);
  const snippets = lesson.visualize.map((id) => snippetById.get(id)).filter((s) => s !== undefined);
  const drills = (lesson.drills ?? []).map((id) => drillById.get(id)).filter((d) => d !== undefined);

  return (
    <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-8 sm:px-6 lg:py-12 xl:grid-cols-[190px_minmax(0,1fr)]">
      <aside className="hidden xl:block">
        <nav aria-label={`${track.title} lessons`} className="sticky top-6">
          <a href={href.track(track.id)} className="font-mono text-[12.5px] text-muted hover:text-text">
            {track.title}
          </a>
          <ol className="mt-3 space-y-0.5 border-l border-rule">
            {track.lessons.map((l, i) => {
              const current = l.id === lesson.id;
              return (
                <li key={l.id}>
                  <a
                    href={href.lesson(track.id, l.id)}
                    aria-current={current ? 'page' : undefined}
                    className={`-ml-px block border-l-2 py-1 pl-3 text-[0.88rem] leading-snug ${
                      current ? 'border-oxide text-strong' : 'border-transparent text-muted hover:text-text'
                    }`}
                  >
                    <span className="mr-1.5 font-mono text-[11px]">{i + 1}</span>
                    {l.title}
                    {read.has(l.id) && !current && <span className="sr-only"> (read)</span>}
                  </a>
                </li>
              );
            })}
          </ol>
          <p className="mt-6 font-mono text-[11.5px] text-muted">On this page</p>
          <ul className="mt-2 space-y-1 text-[0.85rem] text-muted">
            <li><a href="#compare" onClick={jump('compare')} className="hover:text-text">Side by side</a></li>
            <li><a href="#breaks" onClick={jump('breaks')} className="hover:text-text">Where the analogy breaks</a></li>
            {snippets.length > 0 && <li><a href="#visualize" onClick={jump('visualize')} className="hover:text-text">Watch the borrows</a></li>}
            {timelines.length > 0 && <li><a href="#timelines" onClick={jump('timelines')} className="hover:text-text">Watch it run</a></li>}
            {drills.length > 0 && <li><a href="#drills" onClick={jump('drills')} className="hover:text-text">Diagnose it yourself</a></li>}
          </ul>
        </nav>
      </aside>

      <article className="min-w-0">
        <header className="max-w-[72ch]">
          <p className="font-mono text-[12.5px] text-muted">
            <a href={href.track(track.id)} className="hover:text-text xl:hidden">
              {track.title}
            </a>
            <span className="xl:hidden">, lesson {index + 1}</span>
            <span className="hidden xl:inline">Lesson {index + 1}</span>
          </p>
          <h1 className="mt-2 font-mono text-[1.9rem] font-semibold leading-[1.15] tracking-[-0.03em] text-strong sm:text-[2.3rem]">
            {lesson.title}
          </h1>
          <p className="mt-3 text-[1.08rem] text-text">
            <Inline text={lesson.summary} />
          </p>
        </header>

        <Prose paragraphs={lesson.intro} className="mt-6" />

        <section id="compare" className="mt-10 scroll-mt-6">
          <ComparePanes lesson={lesson} />
        </section>

        <section id="breaks" className="mt-14 scroll-mt-6 border-t-2 border-oxide pt-8" aria-labelledby="breaks-h">
          <h2 id="breaks-h" className="font-mono text-[1.45rem] font-semibold tracking-[-0.02em] text-strong">
            Where the analogy breaks
          </h2>
          <div className="mt-8 space-y-10">
            {lesson.breaks.map((b, i) => (
              <div key={i} className={`grid gap-4 ${b.code ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-8' : ''}`}>
                <div>
                  <h3 className="max-w-[60ch] font-mono text-[1.02rem] font-medium leading-snug text-strong">
                    <Inline text={b.heading} />
                  </h3>
                  <Prose paragraphs={b.body} className="mt-3 text-[0.98rem]" />
                </div>
                {b.code && (
                  <div className="min-w-0 xl:pt-1">
                    <CodeBlock
                      code={b.code.code}
                      language={b.code.language}
                      status={b.code.expect}
                      caption={b.code.caption}
                      uncheckedReason={b.code.uncheckedReason}
                      stdout={b.code.stdout}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {snippets.length > 0 && (
          <section id="visualize" className="mt-14 scroll-mt-6 border-t border-rule pt-8" aria-labelledby="visualize-h">
            <h2 id="visualize-h" className="font-mono text-[1.45rem] font-semibold tracking-[-0.02em] text-strong">
              Watch the borrows
            </h2>
            <p className="mt-2 max-w-[68ch] text-muted">
              Each track on the right is one variable. Move through the lines to see what it owns and who is borrowing it.
              Red means the overlap is rejected: by rustc, or at runtime for dashed borrows.
            </p>
            <div className="mt-8 space-y-16">
              {snippets.map((s) => (
                <BorrowVisualizer key={s.id} snippet={s} />
              ))}
            </div>
          </section>
        )}

        {timelines.length > 0 && (
          <section id="timelines" className="mt-14 scroll-mt-6 border-t border-rule pt-8" aria-labelledby="timelines-h">
            <h2 id="timelines-h" className="font-mono text-[1.45rem] font-semibold tracking-[-0.02em] text-strong">
              Watch it run
            </h2>
            <p className="mt-2 max-w-[68ch] text-muted">
              The same program in C# and Rust on a shared clock. Step through it and compare which code runs, and when.
            </p>
            <div className="mt-8 space-y-16">
              {timelines.map((t) => (
                <TimelineView key={t.id} timeline={t} />
              ))}
            </div>
          </section>
        )}

        {drills.length > 0 && (
          <section id="drills" className="mt-14 scroll-mt-6 border-t border-rule pt-8" aria-labelledby="drills-h">
            <h2 id="drills-h" className="font-mono text-[1.45rem] font-semibold tracking-[-0.02em] text-strong">
              Diagnose it yourself
            </h2>
            <p className="mt-2 max-w-[68ch] text-muted">
              Read the error first. Pick what you think is wrong before looking at fixes.
              {drills.some((d) => attempts[d.id]) ? ' Drills you have already tried remember your first answer.' : ''}
            </p>
            <div className="mt-8 space-y-16">
              {drills.map((d) => (
                <DrillCard key={d.id} drill={d} linkToPage />
              ))}
            </div>
          </section>
        )}

        <section className="mt-14 border-t border-rule pt-8" aria-labelledby="carry">
          <h2 id="carry" className="font-mono text-[1.1rem] font-medium text-strong">
            Carry forward
          </h2>
          <ul className="mt-4 max-w-[68ch] space-y-2">
            {lesson.takeaways.map((t, i) => (
              <li key={i} className="border-l-2 border-rule-strong pl-3">
                <Inline text={t} />
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-3 font-mono text-[13.5px]">
            <button
              type="button"
              onClick={() => setRead(lesson.id, !isRead)}
              aria-pressed={isRead}
              className={`rounded-[3px] border px-4 py-2 ${
                isRead ? 'border-verdigris text-verdigris' : 'border-rule-strong text-text hover:bg-surface'
              }`}
            >
              {isRead ? 'Marked as read' : 'Mark as read'}
            </button>
            {next ? (
              <a href={href.lesson(track.id, next.id)} className="rounded-[3px] bg-oxide px-4 py-2 font-medium text-white hover:brightness-110">
                Next: {next.title}
              </a>
            ) : nextTrack ? (
              <a href={href.track(nextTrack.id)} className="rounded-[3px] bg-oxide px-4 py-2 font-medium text-white hover:brightness-110">
                Next track: {nextTrack.title}
              </a>
            ) : (
              <a href={href.drills()} className="rounded-[3px] bg-oxide px-4 py-2 font-medium text-white hover:brightness-110">
                Practise with drills
              </a>
            )}
          </div>
        </section>
      </article>
    </div>
  );
}

function jump(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  };
}
