import type { ReactNode } from 'react';

/** Renders authored prose: `code` and **strong** only. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i): ReactNode => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
          return (
            <code key={i} className="rounded-[3px] bg-raised px-[0.3em] py-[0.05em] font-mono text-[0.88em] text-strong">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-strong">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      })}
    </>
  );
}

export function Prose({ paragraphs, className = '' }: { paragraphs: string[]; className?: string }) {
  return (
    <div className={`max-w-[68ch] space-y-4 ${className}`}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          <Inline text={p} />
        </p>
      ))}
    </div>
  );
}
