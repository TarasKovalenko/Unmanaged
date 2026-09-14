import { useState } from 'react';
import { CodeBlock } from '../components/CodeLine';
import { Inline, Prose } from '../components/Prose';
import { allProjects, ecosystem, projectById } from '../content/projects';
import { tracks } from '../content/tracks';
import type { Milestone, Project } from '../content/types';
import { href } from '../lib/router';
import { useMilestones } from '../lib/storage';
import { NotFound } from './NotFound';

export function ProjectsPage() {
  const { done } = useMilestones();
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 lg:py-12">
      <header className="max-w-[72ch]">
        <h1 className="font-mono text-[2rem] font-semibold tracking-[-0.03em] text-strong">Mini-projects</h1>
        <p className="mt-3 text-[1.02rem]">
          Things you have already built in .NET, rebuilt in Rust. Each is a spec and a set of milestones with a concrete
          checkpoint. Nothing is graded: you run the code on your machine, and the checkpoint tells you whether it works.
        </p>
      </header>

      {allProjects.length === 0 ? (
        <p className="mt-10 text-muted">Projects are being written.</p>
      ) : (
        <ul className="mt-10 grid gap-px overflow-hidden rounded-[4px] border border-rule bg-rule md:grid-cols-2">
          {allProjects.map((p) => {
            const complete = p.milestones.filter((m) => done.has(`${p.id}/${m.id}`)).length;
            return (
              <li key={p.id} className="bg-bg">
                <a href={href.project(p.id)} className="block h-full px-5 py-5 hover:bg-surface">
                  <span className="block font-mono text-[1.02rem] font-medium text-strong">{p.title}</span>
                  <span className="mt-1 block font-mono text-[12px] text-steel">In .NET: {p.dotnetEquivalent}</span>
                  <span className="mt-3 block text-[0.95rem]">
                    <Inline text={p.summary} />
                  </span>
                  <span className="mt-3 block font-mono text-[12px] text-muted">
                    {p.crates.map((c) => c.name).join(', ') || 'std only'}
                    <span className="ml-3">
                      {complete}/{p.milestones.length} milestones done
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {ecosystem.length > 0 && (
        <section className="mt-16" aria-labelledby="ecosystem">
          <h2 id="ecosystem" className="font-mono text-[1.35rem] font-medium tracking-[-0.02em] text-strong">
            The ecosystem, mapped
          </h2>
          <p className="mt-2 max-w-[68ch] text-muted">
            Rust has no standard web framework, ORM or DI container. These are the defaults most teams reach for.
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[0.93rem]">
              <thead>
                <tr className="border-b border-rule-strong font-mono text-[12px] text-muted">
                  <th scope="col" className="py-2 pr-4 font-normal">.NET</th>
                  <th scope="col" className="py-2 pr-4 font-normal">Rust</th>
                  <th scope="col" className="py-2 font-normal">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {ecosystem.map((e) => (
                  <tr key={e.dotnet} className="align-top">
                    <td className="py-3 pr-4 font-mono text-[13px] text-steel">{e.dotnet}</td>
                    <td className="py-3 pr-4 font-mono text-[13px] text-oxide-text">{e.rust}</td>
                    <td className="py-3">
                      <Inline text={e.note} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export function ProjectPage({ projectId }: { projectId: string }) {
  const project = projectById.get(projectId);
  const { done, toggle } = useMilestones();
  if (!project) return <NotFound />;
  const complete = project.milestones.filter((m) => done.has(`${project.id}/${m.id}`)).length;

  return (
    <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:py-12">
      <aside className="hidden lg:block">
        <nav aria-label="Milestones" className="sticky top-6">
          <a href={href.projects()} className="font-mono text-[12.5px] text-muted hover:text-text">
            All projects
          </a>
          <p className="mt-4 font-mono text-[12px] text-muted">
            {complete} of {project.milestones.length} done
          </p>
          <ol className="mt-2 space-y-0.5 border-l border-rule">
            {project.milestones.map((m, i) => {
              const key = `${project.id}/${m.id}`;
              return (
                <li key={m.id}>
                  <a href={`#/projects/${project.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`m-${m.id}`)?.scrollIntoView(); }} className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-[0.88rem] leading-snug text-muted hover:text-text">
                    <span className="mr-1.5 font-mono text-[11px]">{i + 1}</span>
                    {m.title}
                    {done.has(key) && <span className="ml-1.5 font-mono text-[11px] text-verdigris">done</span>}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
      </aside>

      <article className="min-w-0">
        <header className="max-w-[72ch]">
          <p className="font-mono text-[12.5px] text-steel">In .NET: {project.dotnetEquivalent}</p>
          <h1 className="mt-2 font-mono text-[1.9rem] font-semibold leading-[1.15] tracking-[-0.03em] text-strong sm:text-[2.2rem]">
            {project.title}
          </h1>
          <p className="mt-3 text-[1.05rem]">
            <Inline text={project.summary} />
          </p>
          <p className="mt-3 text-[0.92rem] text-muted">
            Exercises:{' '}
            {project.exercises
              .map((id) => tracks.find((t) => t.id === id))
              .filter((t) => t !== undefined)
              .map((t, i, arr) => (
                <span key={t.id}>
                  <a href={href.track(t.id)} className="underline decoration-rule-strong underline-offset-4 hover:text-text">
                    {t.title}
                  </a>
                  {i < arr.length - 1 ? ', ' : ''}
                </span>
              ))}
          </p>
        </header>

        <section className="mt-8" aria-labelledby="spec">
          <h2 id="spec" className="font-mono text-[1.2rem] font-medium text-strong">
            The spec
          </h2>
          <Prose paragraphs={project.spec} className="mt-3" />
        </section>

        {project.crates.length > 0 && (
          <section className="mt-8" aria-labelledby="crates">
            <h2 id="crates" className="font-mono text-[1.2rem] font-medium text-strong">
              Crates
            </h2>
            <ul className="mt-3 divide-y divide-rule border-y border-rule">
              {project.crates.map((c) => (
                <li key={c.name} className="grid gap-1 py-3 sm:grid-cols-[180px_200px_1fr] sm:gap-4">
                  <span className="font-mono text-[13px] text-oxide-text">
                    {c.name} <span className="text-muted">{c.version}</span>
                  </span>
                  <span className="min-w-0 font-mono text-[13px] text-steel [overflow-wrap:anywhere]">{c.dotnet}</span>
                  <span className="text-[0.93rem]">
                    <Inline text={c.why} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-12" aria-labelledby="milestones">
          <h2 id="milestones" className="font-mono text-[1.2rem] font-medium text-strong">
            Milestones
          </h2>
          <ol className="mt-6 space-y-10">
            {project.milestones.map((m, i) => (
              <MilestoneItem
                key={m.id}
                project={project}
                milestone={m}
                index={i}
                isDone={done.has(`${project.id}/${m.id}`)}
                onToggle={() => toggle(`${project.id}/${m.id}`)}
              />
            ))}
          </ol>
        </section>

        {project.stretch && project.stretch.length > 0 && (
          <section className="mt-12 border-t border-rule pt-8" aria-labelledby="stretch">
            <h2 id="stretch" className="font-mono text-[1.1rem] font-medium text-strong">
              If you want more
            </h2>
            <ul className="mt-3 max-w-[68ch] space-y-2">
              {project.stretch.map((s, i) => (
                <li key={i} className="border-l-2 border-rule-strong pl-3">
                  <Inline text={s} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}

function MilestoneItem({
  project,
  milestone: m,
  index,
  isDone,
  onToggle,
}: {
  project: Project;
  milestone: Milestone;
  index: number;
  isDone: boolean;
  onToggle: () => void;
}) {
  const [hints, setHints] = useState(0);
  return (
    <li id={`m-${m.id}`} className="scroll-mt-6">
      <div className={`border-l-2 pl-5 ${isDone ? 'border-verdigris' : 'border-rule-strong'}`}>
        <h3 className="font-mono text-[1.02rem] font-medium text-strong">
          <span className="mr-2 text-muted">{index + 1}</span>
          {m.title}
        </h3>
        <Prose paragraphs={m.goal} className="mt-2 text-[0.98rem]" />

        {m.code && (
          <div className="mt-4 max-w-[860px]">
            <CodeBlock
              code={m.code.code}
              language={m.code.language}
              caption={m.code.caption}
              status={m.code.expect}
              uncheckedReason={m.code.uncheckedReason}
              stdout={m.code.stdout}
            />
          </div>
        )}

        {m.hints.length > 0 && (
          <div className="mt-4">
            {m.hints.slice(0, hints).map((h, i) => (
              <p key={i} className="mb-2 max-w-[68ch] rounded-[3px] bg-surface px-3 py-2 text-[0.93rem]">
                <span className="mr-2 font-mono text-[11.5px] text-muted">hint {i + 1}</span>
                <Inline text={h} />
              </p>
            ))}
            {hints < m.hints.length && (
              <button
                type="button"
                onClick={() => setHints(hints + 1)}
                className="font-mono text-[12.5px] text-muted underline decoration-rule-strong underline-offset-4 hover:text-text"
              >
                {hints === 0 ? 'Show a hint' : 'Show another hint'} ({m.hints.length - hints} left)
              </button>
            )}
          </div>
        )}

        <div className="mt-4 max-w-[72ch] rounded-[4px] border border-rule px-4 py-3">
          <p className="font-mono text-[12px] text-muted">Checkpoint</p>
          <p className="mt-1 text-[0.95rem]">
            <Inline text={m.checkpoint} />
          </p>
          <label className="mt-3 flex cursor-pointer items-center gap-2 font-mono text-[13px]">
            <input type="checkbox" checked={isDone} onChange={onToggle} className="accent-[var(--verdigris)]" />
            <span className={isDone ? 'text-verdigris' : 'text-text'}>{isDone ? 'Done' : 'Mark as done'}</span>
            <span className="sr-only">
              {' '}
              for {project.title}, milestone {index + 1}
            </span>
          </label>
        </div>
      </div>
    </li>
  );
}
