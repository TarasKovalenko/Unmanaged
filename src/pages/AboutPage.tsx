import { useState } from 'react';
import { toolchain } from '../content/meta';
import { clearAllProgress, useStored } from '../lib/storage';
import { useCapabilities } from '../components/useRunnable';
import { href } from '../lib/router';

export function AboutPage() {
  const stored = useStored();
  const caps = useCapabilities();
  const [confirming, setConfirming] = useState(false);
  const drillCount = Object.keys(stored.drills).length;
  const hasProgress = stored.read.length + drillCount + stored.milestones.length > 0;
  return (
    <div className="mx-auto max-w-[760px] px-4 py-10 sm:px-6 lg:py-14">
      <h1 className="font-mono text-[2rem] font-semibold tracking-[-0.03em] text-strong">About</h1>

      <div className="mt-6 space-y-4 text-[1.02rem]">
        <p>
          Unmanaged teaches Rust to developers who already write C# for a living. It skips everything that translates
          cleanly and spends its time on the handful of ideas where C# intuition gives the wrong answer.
        </p>
        <p>
          Existing material for C# developers is mostly prose, and the mapping itself is well documented. What is missing is
          a way to see ownership happen, so the borrow visualizer is the centre of the site rather than an illustration.
        </p>
      </div>

      <h2 className="mt-12 font-mono text-[1.2rem] font-medium text-strong">What this does not do</h2>
      <ul className="mt-4 space-y-3 text-[1rem]">
        <li className="border-l-2 border-rule-strong pl-3">
          <strong className="font-semibold text-strong">Code runs on a server, not in your browser.</strong> Rust and C#
          cannot be compiled in a browser tab. Run sends the code to a code runner (a small service that ships with this
          site and compiles with rustc and Roslyn in an isolated container) or, for Rust when no runner is available, to
          the public Rust Playground at play.rust-lang.org. Anything you edit and run is sent there too.
        </li>
        <li className="border-l-2 border-rule-strong pl-3">
          <strong className="font-semibold text-strong">On this site right now:</strong>{' '}
          {caps === null
            ? 'checking…'
            : [
                `Rust ${caps.rust === 'runner' ? 'runs on the code runner' : caps.rust === 'playground' ? 'runs on play.rust-lang.org' : 'cannot be run'}`,
                `C# ${caps.csharp === 'runner' ? 'runs on the code runner' : 'cannot be run (no code runner is configured)'}`,
              ].join('; ')}
          .
        </li>
        <li className="border-l-2 border-rule-strong pl-3">
          <strong className="font-semibold text-strong">Compiler output is copied, not generated.</strong> Every Rust
          program was compiled with rustc {toolchain.rustc} (edition {toolchain.edition}) by the content check. Programs
          that show output or panic were also run, and the output shown is what they printed. Error and panic text is
          pasted from that output, and the check fails if it ever stops matching. Newer compilers may word errors
          differently. Code that needs crates from crates.io (tokio, axum, serde) cannot be checked this way and is
          labelled "not compiled".
        </li>
        <li className="border-l-2 border-rule-strong pl-3">
          <strong className="font-semibold text-strong">The borrow tracks are drawn by hand.</strong> Spans are authored,
          not inferred. They show the model rustc uses, simplified to lines; the real analysis works on a control-flow graph
          and is more precise than any line-based picture.
        </li>
        <li className="border-l-2 border-rule-strong pl-3">
          <strong className="font-semibold text-strong">No accounts, no tracking.</strong> Your read markers and theme
          live in this browser's localStorage and nowhere else.
        </li>
        <li className="border-l-2 border-rule-strong pl-3">
          <strong className="font-semibold text-strong">Many C# snippets are excerpts.</strong> Every C# snippet was compiled
          with the runner's own Roslyn setup. Complete programs, including every async timeline, were also run and their
          output checked. Excerpts that use types defined elsewhere say so when you try to compile them.
        </li>
        <li className="border-l-2 border-rule-strong pl-3">
          <strong className="font-semibold text-strong">Projects are not graded.</strong> Milestones have concrete
          checkpoints you verify on your own machine; the site only remembers which ones you ticked.
        </li>
      </ul>

      <h2 className="mt-12 font-mono text-[1.2rem] font-medium text-strong">Your progress</h2>
      <p className="mt-3 text-[0.98rem]">
        Stored in this browser only: {stored.read.length} lessons marked read, {drillCount} drills answered,{' '}
        {stored.milestones.length} project milestones ticked.
      </p>
      {hasProgress && (
        <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-[13px]">
          {confirming ? (
            <>
              <span className="text-text">This removes all of it and cannot be undone.</span>
              <button
                type="button"
                onClick={() => {
                  clearAllProgress();
                  setConfirming(false);
                }}
                className="rounded-[3px] border border-danger px-3 py-1.5 text-danger hover:bg-danger-soft"
              >
                Clear progress
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-[3px] border border-rule px-3 py-1.5 text-muted hover:text-text">
                Keep it
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="rounded-[3px] border border-rule-strong px-3 py-1.5 text-text hover:bg-surface">
              Clear progress…
            </button>
          )}
        </div>
      )}

      <p className="mt-10 text-muted">
        <a href={href.track('ownership')} className="text-text underline decoration-oxide underline-offset-4">
          Start the ownership track
        </a>
      </p>
    </div>
  );
}
