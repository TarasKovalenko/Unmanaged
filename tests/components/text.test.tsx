import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Inline, Prose } from '../../src/components/Prose';
import { RustcBlock, RustcOutput } from '../../src/components/RustcOutput';

describe('Inline', () => {
  test('renders `code` and **strong** and leaves other text alone', () => {
    const { container } = render(
      <p>
        <Inline text="Call `clone()` on a **String**, not a lone ` backtick or **" />
      </p>,
    );
    expect(container.querySelector('code')).toHaveTextContent('clone()');
    expect(container.querySelector('strong')).toHaveTextContent('String');
    expect(container).toHaveTextContent('Call clone() on a String, not a lone ` backtick or **');
    expect(container.querySelectorAll('code, strong')).toHaveLength(2);
  });
});

describe('Prose', () => {
  test('renders one paragraph per entry with the given class', () => {
    const { container } = render(<Prose paragraphs={['First `a`.', 'Second **b**.']} className="extra" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveTextContent('First a.');
    expect(paragraphs[1].querySelector('strong')).toHaveTextContent('b');
    expect(container.firstChild).toHaveClass('extra');
  });

  test('works without a class', () => {
    const { container } = render(<Prose paragraphs={['Only']} />);
    expect(container.firstChild).toHaveClass('space-y-4');
    expect(screen.getByText('Only')).toBeInTheDocument();
  });
});

describe('RustcOutput', () => {
  const message = [
    'error[E0502]: cannot borrow `v` as mutable',
    ' --> src/main.rs:4:5',
    '  |',
    '3 |     let first = &v[0];',
    '  |                  - immutable borrow occurs here',
    '4 |     v.push(4);',
    '  |     ^^^^^^^^^ mutable borrow occurs here',
    '',
    'note: borrows last until their last use',
    '  = help: consider cloning',
    '...',
    "thread 'main' panicked at src/main.rs:6:10:",
    'plain text',
  ].join('\n');

  test('colours each kind of row like a terminal would', () => {
    const { container } = render(<RustcOutput message={message} />);
    const rows = [...container.querySelectorAll('div')];
    expect(rows).toHaveLength(13);
    const cls = (i: number) => rows[i].className;
    expect(cls(0)).toBe('text-danger font-semibold');
    expect(cls(1)).toBe('text-muted');
    expect(cls(2)).toBe('text-muted');
    expect(cls(3)).toBe('text-muted');
    expect(cls(4)).toBe('text-steel'); // secondary marker
    expect(cls(6)).toBe('text-danger'); // primary marker
    expect(rows[7].textContent).toBe('\u00a0'); // blank rows keep their height
    expect(cls(8)).toBe('text-steel');
    expect(cls(9)).toBe('text-steel');
    expect(cls(10)).toBe('text-muted');
    expect(cls(11)).toBe('text-ochre font-semibold');
    expect(cls(12)).toBe('');
  });
});

describe('RustcBlock', () => {
  test('shows an optional label above the output', () => {
    const { rerender, container } = render(<RustcBlock message="error: boom" label="cargo build" />);
    expect(screen.getByText('cargo build')).toBeInTheDocument();
    expect(screen.getByText('error: boom')).toHaveClass('text-danger');
    rerender(<RustcBlock message="error: boom" />);
    expect(screen.queryByText('cargo build')).not.toBeInTheDocument();
    expect(container.querySelectorAll('pre')).toHaveLength(1);
  });
});
