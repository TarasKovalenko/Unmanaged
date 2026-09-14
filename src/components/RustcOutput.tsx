/** Colours rustc (or panic) output the way a terminal would, without parsing it deeply. */
export function RustcOutput({ message }: { message: string }) {
  return (
    <>
      {message.split('\n').map((row, i) => {
        let cls = '';
        if (/^error/.test(row)) cls = 'text-danger font-semibold';
        else if (/panicked at/.test(row)) cls = 'text-ochre font-semibold';
        else if (/^\s*(note|help|= help|= note)/.test(row)) cls = 'text-steel';
        else if (/^\s*(\d+\s*)?\|/.test(row) || /^\s*-->/.test(row) || row === '...') cls = 'text-muted';
        const markers = /^\s*\|\s*[\^\-|]/.test(row);
        return (
          <div key={i} className={markers ? (row.includes('^') ? 'text-danger' : 'text-steel') : cls}>
            {row || ' '}
          </div>
        );
      })}
    </>
  );
}

export function RustcBlock({ message, label }: { message: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-[4px] border border-rule bg-bg">
      {label && <div className="border-b border-rule px-3 py-1.5 font-mono text-[11.5px] text-muted">{label}</div>}
      <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-[1.55] text-text">
        <RustcOutput message={message} />
      </pre>
    </div>
  );
}
