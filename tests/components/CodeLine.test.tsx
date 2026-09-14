import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { CodeLine, CompileStatus, LanguageLabel, ProgramOutput } from '../../src/components/CodeLine';
import { fresh, mockFetch } from './runnerFetch';

const loadCodeLine = () => fresh(() => import('../../src/components/CodeLine'));

describe('CodeLine', () => {
  test('highlights tokens by kind', () => {
    const { container } = render(<CodeLine text={'let s = String::from("hi"); // note'} language="rust" />);
    expect(screen.getByText('let')).toHaveClass('tok-keyword');
    expect(screen.getByText('String')).toHaveClass('tok-type');
    expect(screen.getByText('"hi"')).toHaveClass('tok-string');
    expect(screen.getByText('// note')).toHaveClass('tok-comment');
    expect(container).toHaveTextContent('let s = String::from("hi"); // note');
  });

  test('an empty line renders a space so the row keeps its height', () => {
    const { container } = render(<CodeLine text="" language="csharp" />);
    expect(container.textContent).toBe('\u00a0');
  });

  test('draws rustc marks, with primary winning over secondary and labels as titles', () => {
    const text = 'v.push(first);';
    render(
      <CodeLine
        text={text}
        language="rust"
        marks={[
          { line: 1, start: 0, end: 13, primary: true, label: 'mutable borrow' },
          { line: 1, start: 7, end: 40, primary: false, label: '' },
        ]}
      />,
    );
    const primary = document.querySelectorAll('.mark-primary');
    expect([...primary].map((e) => e.textContent).join('')).toBe('v.push(first)');
    primary.forEach((e) => expect(e).toHaveAttribute('title', 'mutable borrow'));
    const secondary = document.querySelectorAll('.mark-secondary');
    expect([...secondary].map((e) => e.textContent).join('')).toBe(';');
    secondary.forEach((e) => expect(e).not.toHaveAttribute('title'));
  });
});

describe('LanguageLabel', () => {
  test.each([
    ['csharp', 'C#'],
    ['rust', 'Rust'],
    ['toml', 'TOML'],
    ['shell', 'Shell'],
  ] as const)('labels %s as %s', (language, label) => {
    render(<LanguageLabel language={language} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('CompileStatus', () => {
  test('compiles', () => {
    render(<CompileStatus status="compiles" />);
    expect(screen.getByText('compiles')).toHaveClass('text-verdigris');
  });

  test('fails, with and without error codes', () => {
    const { rerender } = render(<CompileStatus status="fails" codes={['E0382', 'E0502']} />);
    expect(screen.getByText('does not compile: E0382, E0502')).toBeInTheDocument();
    rerender(<CompileStatus status="fails" codes={[]} />);
    expect(screen.getByText('does not compile')).toBeInTheDocument();
    rerender(<CompileStatus status="fails" />);
    expect(screen.getByText('does not compile')).toBeInTheDocument();
  });

  test('panics', () => {
    render(<CompileStatus status="panics" />);
    expect(screen.getByText('compiles, panics at runtime')).toHaveClass('text-ochre');
  });

  test('unchecked explains why in its title', () => {
    render(<CompileStatus status="unchecked" reason="needs tokio" />);
    expect(screen.getByText('not compiled: needs crates')).toHaveAttribute('title', 'needs tokio');
  });
});

describe('ProgramOutput', () => {
  test('shows the text under a label, or says nothing was printed', () => {
    const { rerender } = render(<ProgramOutput text="42" />);
    expect(screen.getByText('output')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    rerender(<ProgramOutput text="" label="stdout" />);
    expect(screen.getByText('stdout')).toBeInTheDocument();
    expect(screen.getByText('(nothing printed)')).toBeInTheDocument();
  });
});

describe('CodeBlock', () => {
  const CODE = 'fn main() {\n    println!("hi");\n}';

  test('without a backend it is a static block with line numbers, highlight, status and verified output', async () => {
    mockFetch({ mode: 'none' });
    const { CodeBlock } = await loadCodeLine();
    const { container } = render(
      <CodeBlock code={CODE} language="rust" caption="main.rs" status="fails" errorCode="E0382" highlight={[2]} stdout="hi" />,
    );
    const figure = screen.getByRole('figure');
    expect(within(figure).getByText('Rust')).toBeInTheDocument();
    expect(figure).toHaveTextContent('Rust main.rs');
    expect(screen.getByText('does not compile: E0382')).toBeInTheDocument();
    expect(screen.getByText('output (verified)')).toBeInTheDocument();
    const rows = container.querySelectorAll('pre > div');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveClass('bg-raised');
    expect(rows[0]).not.toHaveClass('bg-raised');
    expect(rows[1].firstChild).toHaveTextContent('2');
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());
  });

  test('a status without an error code, and no caption', async () => {
    mockFetch({ mode: 'none' });
    const { CodeBlock } = await loadCodeLine();
    const { container } = render(<CodeBlock code={CODE} language="rust" status="compiles" />);
    expect(screen.getByText('compiles')).toBeInTheDocument();
    expect(container.querySelector('figcaption span')).toHaveTextContent(/^Rust$/);
  });

  test('status is only shown for Rust', async () => {
    mockFetch({ mode: 'none' });
    const { CodeBlock } = await loadCodeLine();
    render(<CodeBlock code="[package]" language="toml" status="compiles" caption="Cargo.toml" />);
    expect(screen.queryByText('compiles')).not.toBeInTheDocument();
    expect(screen.getByRole('figure')).toHaveTextContent('TOML Cargo.toml');
  });

  test('compact blocks hide line numbers and are never runnable', async () => {
    mockFetch({ mode: 'runner' });
    const { CodeBlock } = await loadCodeLine();
    const { container } = render(<CodeBlock code={'let a = 1;\nlet b = 2;'} language="rust" compact />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
    expect(container.querySelector('pre')).toHaveTextContent(/^let a = 1;let b = 2;$/);
  });

  test('unchecked code and runnable={false} get no Run button', async () => {
    mockFetch({ mode: 'runner' });
    const { CodeBlock } = await loadCodeLine();
    render(
      <>
        <CodeBlock code={CODE} language="rust" status="unchecked" uncheckedReason="needs tokio" />
        <CodeBlock code={CODE} language="csharp" runnable={false} />
        <CodeBlock code={CODE} language="shell" />
      </>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText('not compiled: needs crates')).toHaveAttribute('title', 'needs tokio');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('with a backend, editing marks the block as edited, hides verified output and highlight, and Reset restores it', async () => {
    const user = userEvent.setup();
    mockFetch({ mode: 'runner' });
    const { CodeBlock } = await loadCodeLine();
    const { container } = render(<CodeBlock code={CODE} language="rust" status="compiles" highlight={[1]} stdout="hi" />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const editor = screen.getByRole('textbox', { name: /Edit Rust code/ });
    await user.type(editor, '// changed');
    expect(screen.getByText('edited')).toBeInTheDocument();
    expect(screen.queryByText('compiles')).not.toBeInTheDocument();
    expect(screen.queryByText('output (verified)')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(container.querySelector('pre')).toHaveTextContent('// changed');
    expect(container.querySelector('pre > div')).not.toHaveClass('bg-raised');

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByText('edited')).not.toBeInTheDocument();
    expect(screen.getByText('compiles')).toBeInTheDocument();
    expect(screen.getByText('output (verified)')).toBeInTheDocument();
    expect(container.querySelector('pre > div')).toHaveClass('bg-raised');
  });

  test('Run shows the result under the block', async () => {
    const user = userEvent.setup();
    mockFetch({ mode: 'runner', run: () => ({ toolchain: 'rustc 1.90.0', mode: 'run', compile: { success: true, output: '', durationMs: 1 }, execution: { exitCode: 0, stdout: 'hi\n', stderr: '', timedOut: false, truncated: false, durationMs: 1 } }) });
    const { CodeBlock } = await loadCodeLine();
    render(<CodeBlock code={CODE} language="rust" />);
    await user.click(await screen.findByRole('button', { name: 'Run' }));
    expect(await screen.findByText('ran successfully')).toBeInTheDocument();
  });
});
