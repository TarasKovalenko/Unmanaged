import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import type { Lesson } from '../../src/content/types';
import { fresh, mockFetch, type RunnerMode } from './runnerFetch';

function lesson(overrides: Partial<Lesson['rust']> = {}): Lesson {
  return {
    id: 'moves',
    title: 'Moves',
    summary: 'Moves.',
    intro: [],
    csharp: {
      filename: 'Program.cs',
      code: ['var a = new List<int>();', 'var b = a;', 'Console.WriteLine(a.Count);'].join('\n'),
    },
    rust: {
      filename: 'main.rs',
      code: ['fn main() {', '    let a = Vec::<i32>::new();', '    let b = a;', '    println!("{}", b.len());', '}'].join('\n'),
      ...overrides,
    },
    links: [
      { csharp: [1], rust: [2], note: 'Both create a `List`.' },
      { csharp: [2], rust: [3], note: 'Assignment **moves** in Rust.' },
    ],
    breaks: [],
    visualize: [],
    takeaways: [],
  };
}

async function renderPanes(l = lesson(), mode: RunnerMode = 'none') {
  mockFetch({ mode });
  const { ComparePanes } = await fresh(() => import('../../src/components/ComparePanes'));
  render(<ComparePanes lesson={l} />);
  return { user: userEvent.setup() };
}

const pane = (name: RegExp) => screen.getByRole('heading', { name }).parentElement!;
const csharpPane = () => pane(/C# you already write/);
const rustPane = () => pane(/Rust equivalent/);
const rows = (p: HTMLElement) => [...p.querySelectorAll<HTMLElement>('pre > div')];
const lit = (p: HTMLElement) => rows(p).flatMap((r, i) => (r.classList.contains('bg-raised') ? [i + 1] : []));
const noteButton = (text: RegExp) => within(screen.getByRole('list', { name: 'Line-by-line notes' })).getByRole('button', { name: text });
// The per-pane note is the short copy shown on narrow screens, under the pane it came from.
const paneNote = (p: HTMLElement) => p.querySelector(':scope > p');

describe('ComparePanes', () => {
  test('renders both panes with filenames, line numbers and every note', async () => {
    await renderPanes();
    expect(csharpPane()).toHaveTextContent('C# Program.cs');
    expect(rustPane()).toHaveTextContent('Rust main.rs');
    expect(rows(rustPane())).toHaveLength(5);
    expect(noteButton(/C# 1 \/ Rust 2/)).toHaveTextContent('Both create a List.');
    expect(noteButton(/C# 2 \/ Rust 3/)).toHaveAttribute('aria-pressed', 'false');
    expect(lit(csharpPane())).toEqual([]);
  });

  test('hovering a linked line lights up its partner and shows the note under that pane', async () => {
    const { user } = await renderPanes();
    await user.hover(rows(csharpPane())[1]);
    expect(lit(csharpPane())).toEqual([2]);
    expect(lit(rustPane())).toEqual([3]);
    expect(paneNote(csharpPane())).toHaveTextContent('Assignment moves in Rust.');
    expect(paneNote(rustPane())).toBeNull();

    await user.unhover(rows(csharpPane())[1]);
    expect(lit(rustPane())).toEqual([]);
    expect(paneNote(csharpPane())).toBeNull();
  });

  test('lines without a link do nothing on hover or click', async () => {
    const { user } = await renderPanes();
    const brace = rows(rustPane())[0];
    expect(brace).not.toHaveClass('cursor-pointer');
    expect(rows(rustPane())[1]).toHaveClass('cursor-pointer');
    await user.hover(brace);
    await user.click(brace);
    expect(lit(csharpPane())).toEqual([]);
    expect(noteButton(/Rust 2/)).toHaveAttribute('aria-pressed', 'false');
  });

  test('clicking a line pins its link until it is clicked again; another line moves the pin', async () => {
    const { user } = await renderPanes();
    const line2 = rows(rustPane())[1];
    await user.click(line2);
    await user.unhover(line2);
    expect(noteButton(/Rust 2/)).toHaveAttribute('aria-pressed', 'true');
    expect(lit(csharpPane())).toEqual([1]);
    expect(paneNote(rustPane())).toHaveTextContent('Both create a List.');

    // Hover wins over the pin while it lasts.
    await user.hover(rows(csharpPane())[1]);
    expect(lit(rustPane())).toEqual([3]);
    await user.unhover(rows(csharpPane())[1]);
    expect(lit(rustPane())).toEqual([2]);

    await user.click(rows(csharpPane())[1]);
    expect(noteButton(/Rust 3/)).toHaveAttribute('aria-pressed', 'true');
    expect(noteButton(/Rust 2/)).toHaveAttribute('aria-pressed', 'false');

    await user.click(rows(csharpPane())[1]);
    await user.unhover(rows(csharpPane())[1]);
    expect(noteButton(/Rust 3/)).toHaveAttribute('aria-pressed', 'false');
    expect(lit(rustPane())).toEqual([]);
  });

  test('note buttons highlight on hover and focus, and pin on click', async () => {
    const { user } = await renderPanes();
    const second = noteButton(/Rust 3/);
    await user.hover(second);
    expect(lit(csharpPane())).toEqual([2]);
    expect(paneNote(rustPane())).toHaveTextContent('Assignment moves in Rust.');
    expect(second).toHaveClass('border-ochre');
    await user.unhover(second);
    expect(lit(csharpPane())).toEqual([]);

    second.focus();
    await user.tab({ shift: true });
    expect(noteButton(/Rust 2/)).toHaveFocus();
    expect(lit(rustPane())).toEqual([2]);
    await user.tab();
    expect(lit(rustPane())).toEqual([3]);
    await user.tab();
    expect(lit(rustPane())).toEqual([]);

    await user.click(second);
    expect(second).toHaveAttribute('aria-pressed', 'true');
    await user.click(second);
    expect(second).toHaveAttribute('aria-pressed', 'false');
  });

  test('an unchecked Rust pane says why and offers no Run, while C# still can', async () => {
    const { user } = await renderPanes(lesson({ expect: 'unchecked', uncheckedReason: 'needs tokio' }), 'runner');
    expect(within(rustPane()).getByText('not compiled: needs crates')).toHaveAttribute('title', 'needs tokio');
    expect(await within(csharpPane()).findByRole('button', { name: 'Run' })).toBeInTheDocument();
    expect(within(rustPane()).queryByRole('button')).not.toBeInTheDocument();
    await user.hover(rows(rustPane())[2]);
    expect(lit(csharpPane())).toEqual([2]);
  });

  test('editing a pane pauses its line notes but keeps the other pane linked', async () => {
    const { user } = await renderPanes(lesson(), 'runner');
    await user.click(await within(rustPane()).findByRole('button', { name: 'Edit' }));
    const editor = within(rustPane()).getByRole('textbox', { name: /Edit Rust code/ });
    expect(rows(rustPane())).toHaveLength(0);
    await user.type(editor, '// mine');
    expect(within(rustPane()).getByText('edited, line notes paused')).toBeInTheDocument();
    await user.click(within(rustPane()).getByRole('button', { name: 'Done' }));

    const line2 = rows(rustPane())[1];
    expect(line2).not.toHaveClass('cursor-pointer');
    await user.hover(line2);
    await user.click(line2);
    expect(noteButton(/Rust 2/)).toHaveAttribute('aria-pressed', 'false');

    // The C# pane still links, but the edited Rust pane does not light up.
    await user.hover(rows(csharpPane())[0]);
    expect(lit(csharpPane())).toEqual([1]);
    expect(lit(rustPane())).toEqual([]);
    expect(within(csharpPane()).queryByText('edited, line notes paused')).not.toBeInTheDocument();
  });

  test('Run output appears under the pane that ran', async () => {
    const { user } = await renderPanes(lesson(), 'runner');
    mockFetch({
      mode: 'runner',
      run: () => ({ toolchain: 'rustc', mode: 'run', compile: { success: true, output: '', durationMs: 1 }, execution: { exitCode: 0, stdout: '0\n', stderr: '', timedOut: false, truncated: false, durationMs: 1 } }),
    });
    await user.click(await within(rustPane()).findByRole('button', { name: 'Run' }));
    expect(await within(rustPane()).findByText('ran successfully')).toBeInTheDocument();
    expect(within(csharpPane()).queryByText('ran successfully')).not.toBeInTheDocument();
  });
});
