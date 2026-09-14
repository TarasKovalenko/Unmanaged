import { BorrowVisualizer } from '../components/BorrowVisualizer';
import { Inline } from '../components/Prose';
import { content } from '../content';
import { snippetById } from '../content/borrow';
import { lessonIndex, tracks } from '../content/tracks';
import { href } from '../lib/router';
import { useDrillAttempts, useProgress } from '../lib/storage';

export function HomePage() {
  const { lastLesson, read } = useProgress();
  const { attempts } = useDrillAttempts();
  const resume = lastLesson ? lessonIndex.get(lastLesson.lessonId) : undefined;
  const hero = snippetById.get('move-on-assign')!;
  const missed = content.drills.filter((d) => attempts[d.id] && !attempts[d.id].correctFirstTry);

  const practice = [
    { to: href.visualizer(), title: 'Borrow visualizer', count: content.snippets.length, unit: 'snippets', body: 'Ownership and borrows drawn as intervals, with the real compiler error where they collide.' },
    { to: href.drills(), title: 'Error drills', count: content.drills.length, unit: 'drills', body: 'A rustc error and the code behind it. Diagnose it before you see the fixes, including the ones that only look right.' },
    { to: href.gotchas(), title: 'Gotchas', count: content.gotchas.length, unit: 'cards', body: 'Small places where a C# habit gives the wrong answer, each proven by a program.' },
    { to: href.phrasebook(), title: 'Phrasebook', count: content.phrases.length, unit: 'entries', body: 'C# construct in, closest Rust out, with an honest note on how close.' },
    { to: href.projects(), title: 'Mini-projects', count: content.projects.length, unit: 'projects', body: 'CLI tools, APIs and workers you have built in .NET, rebuilt with milestones.' },
    { to: href.errors(), title: 'Error index', count: null, unit: '', body: 'Every error code on the site, and where to watch it happen.' },
  ].filter((p) => p.count === null || p.count > 0);

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
      <section className="grid gap-10 pb-14 pt-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12 lg:pt-16">
        <div className="lg:pt-4">
          <h1 className="font-mono text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.035em] text-strong sm:text-[3.1rem]">
            <span className="text-oxide-text">&amp;</span>unmanaged
          </h1>
          <p className="mt-3 font-mono text-[1.05rem] text-text">Rust for people who write C#.</p>
          <div className="mt-8 max-w-[52ch] space-y-4 text-[1.02rem]">
            <p>You already know generics, closures, pattern matching, async and LINQ. Nobody needs to explain those again.</p>
            <p>
              What stops C# developers is a short list of places where twenty years of intuition point the wrong way. This
              site covers that list and skips the rest.
            </p>
            <p className="text-muted">
              Alongside: code a C# developer writes without a second thought. Move the cursor down the code and watch{' '}
              <code className="font-mono text-[0.9em] text-text">customer</code> stop owning anything.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3 font-mono text-[13.5px]">
            {resume ? (
              <a href={href.lesson(resume.track.id, resume.lesson.id)} className="rounded-[3px] bg-oxide px-4 py-2 font-medium text-white hover:brightness-110">
                Continue: {resume.lesson.title}
              </a>
            ) : (
              <a href={href.lesson('ownership', 'moves')} className="rounded-[3px] bg-oxide px-4 py-2 font-medium text-white hover:brightness-110">
                Start with ownership
              </a>
            )}
            {missed.length > 0 ? (
              <a href={href.drills()} className="rounded-[3px] border border-rule-strong px-4 py-2 text-text hover:bg-surface">
                Revisit {missed.length} missed {missed.length === 1 ? 'drill' : 'drills'}
              </a>
            ) : (
              <a href={href.drills()} className="rounded-[3px] border border-rule-strong px-4 py-2 text-text hover:bg-surface">
                Try an error drill
              </a>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <BorrowVisualizer snippet={hero} headingLevel={2} />
        </div>
      </section>

      <section className="border-t border-rule py-12" aria-labelledby="stuck-points">
        <h2 id="stuck-points" className="font-mono text-[1.35rem] font-medium tracking-[-0.02em] text-strong">
          Six places C# intuition misleads you
        </h2>
        <p className="mt-2 max-w-[62ch] text-muted">In the order they tend to hit. Each track is a short sequence of lessons.</p>
        <ol className="mt-8 grid gap-px overflow-hidden rounded-[4px] border border-rule bg-rule md:grid-cols-2">
          {tracks.map((t) => {
            const available = t.status === 'available';
            const readCount = t.lessons.filter((l) => read.has(l.id)).length;
            const inner = (
              <>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-[1rem] font-medium text-strong">
                    <span className="mr-3 text-muted">{t.order}</span>
                    {t.title}
                  </span>
                  <span className={`shrink-0 font-mono text-[12px] ${available ? 'text-muted' : 'text-muted/70'}`}>
                    {available ? (
                      <>
                        {t.lessons.length} lessons
                        {readCount > 0 && <span className="text-verdigris">, {readCount} read</span>}
                      </>
                    ) : (
                      'not written yet'
                    )}
                  </span>
                </div>
                <p className={`mt-2 max-w-[60ch] pl-7 text-[0.95rem] ${available ? 'text-text' : 'text-muted'}`}>
                  <Inline text={t.pitch} />
                </p>
              </>
            );
            return (
              <li key={t.id} className="bg-bg">
                {available ? (
                  <a href={href.track(t.id)} className="block h-full px-5 py-5 hover:bg-surface">
                    {inner}
                  </a>
                ) : (
                  <div className="h-full px-5 py-5">{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="border-t border-rule py-12" aria-labelledby="practice">
        <h2 id="practice" className="font-mono text-[1.35rem] font-medium tracking-[-0.02em] text-strong">
          Outside the tracks
        </h2>
        <p className="mt-2 max-w-[62ch] text-muted">For practice, lookup, and the moment you hit an error at work.</p>
        <ul className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
          {practice.map((p) => (
            <li key={p.title}>
              <a href={p.to} className="group block">
                <span className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
                  <span className="font-mono text-[1rem] font-medium text-strong group-hover:underline group-hover:decoration-oxide group-hover:underline-offset-4">
                    {p.title}
                  </span>
                  {p.count !== null && (
                    <span className="font-mono text-[12px] text-muted">
                      {p.count} {p.unit}
                    </span>
                  )}
                </span>
                <span className="mt-2 block text-[0.95rem] text-text">{p.body}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
