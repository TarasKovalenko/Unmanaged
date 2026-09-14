import { href } from '../lib/router';

export function NotFound() {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
      <pre className="overflow-x-auto font-mono text-[13px] text-danger">error[E0425]: cannot find page in this scope</pre>
      <p className="mt-4">
        This address does not match a lesson or snippet.{' '}
        <a href={href.home()} className="underline decoration-oxide underline-offset-4">
          Go to the start
        </a>
        .
      </p>
    </div>
  );
}
