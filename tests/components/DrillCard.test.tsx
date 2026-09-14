import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { allDrills } from '../../src/content/drills/index.ts';
import type { Drill } from '../../src/content/types';
import { callsTo, fresh, mockFetch, runnerResult, type RunnerMode } from './runnerFetch';

const CODE = ['fn main() {', '    let s = String::from("hi");', '    let t = s;', '    println!("{} {}", t, s);', '}'].join('\n');

const MESSAGE = [
  'error[E0382]: borrow of moved value: `s`',
  ' --> src/main.rs:4:26',
  '  |',
  '2 |     let s = String::from("hi");',
  '  |         - move occurs because `s` has type `String`',
  '3 |     let t = s;',
  '  |             - value moved here',
  '4 |     println!("{} {}", t, s);',
  '  |                       -  ^ value borrowed here after move',
].join('\n');

function drill(overrides: Partial<Drill> = {}): Drill {
  return {
    id: 'test-moved-string',
    track: 'ownership',
    title: 'Use after move',
    code: CODE,
    outcome: 'compile-error',
    errorCode: 'E0382',
    message: MESSAGE,
    csharpReflex: 'Assigning a reference type just copies the `reference`.',
    options: [
      { text: 'The String was moved into `t`', correct: true, why: 'Assignment moves ownership.' },
      { text: 'println! cannot print Strings', why: 'It can, through Display.' },
      { text: 'The variable is not mutable', why: 'Nothing is mutated here.' },
    ],
    fixes: [
      { label: 'Borrow instead', verdict: 'idiomatic', code: 'fn main() { let s = String::new(); let t = &s; println!("{t}{s}"); }', expect: 'compiles', note: 'Take a `&` reference.' },
      { label: 'Clone it', verdict: 'works-but', code: 'fn main() { let s = String::new(); let t = s.clone(); println!("{t}{s}"); }', expect: 'compiles', note: 'An extra allocation.' },
      { label: 'Use a crate', verdict: 'wrong', code: 'fn main() { magic::fix(); }', expect: 'unchecked', uncheckedReason: 'needs the magic crate', note: 'There is no such crate.' },
    ],
    ...overrides,
  };
}

async function renderDrill(props: { drill?: Drill; linkToPage?: boolean; onNext?: () => void; headingLevel?: 2 | 3 } = {}, mode: RunnerMode = 'none') {
  const fetchMock = mockFetch({ mode, run: () => runnerResult({ execution: { stdout: 'hihi\n' } }) });
  const { DrillCard } = await fresh(() => import('../../src/components/DrillCard'));
  const d = props.drill ?? drill();
  const utils = render(<DrillCard {...props} drill={d} />);
  return { ...utils, fetchMock, user: userEvent.setup(), DrillCard, d };
}

const option = (text: RegExp) => screen.getByRole('radio', { name: text });
const stored = () => JSON.parse(localStorage.getItem('unmanaged.v1') ?? '{}').drills ?? {};
const gutter = (container: HTMLElement) => [...container.querySelectorAll('figure pre > div > span:first-child')];

describe('DrillCard', () => {
  test('shows the code, the compiler output and the question before any answer', async () => {
    const { container } = await renderDrill();
    expect(screen.getByRole('heading', { level: 3, name: 'Use after move' })).toBeInTheDocument();
    expect(screen.getByText('The C# reflex:').parentElement).toHaveTextContent('Assigning a reference type just copies the reference.');
    expect(screen.getByText('cargo build')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'What is the actual problem?' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText(/solved before|missed last time/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'open on its own' })).not.toBeInTheDocument();
    // The line with the primary error gets a red gutter; rustc's underlines are drawn on the code.
    expect(gutter(container).map((g) => g.classList.contains('border-danger'))).toEqual([false, false, false, true, false]);
    expect(container.querySelectorAll('figure .mark-secondary')).toHaveLength(3);
    expect(container.querySelector('figure .mark-primary')).toHaveAttribute('title', 'value borrowed here after move');
  });

  test('options are shown in a stable shuffled order', async () => {
    const d = drill();
    await renderDrill({ drill: d });
    const shown = screen.getAllByRole('radio').map((r) => r.closest('label')!.textContent);
    const { seededOrder } = await import('../../src/lib/format');
    expect(shown).toEqual(seededOrder(3, d.id).map((i) => d.options[i].text.replace(/`/g, '')));
  });

  test('choosing the right diagnosis reveals the reasons, records it and opens the fixes', async () => {
    const { user } = await renderDrill();
    await user.click(option(/moved into t/));
    expect(screen.getByRole('status')).toHaveTextContent('Right diagnosis.');
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(option(/moved into t/)).toBeChecked();
    expect(screen.getByText('Assignment moves ownership.')).toBeInTheDocument();
    expect(screen.getByText('It can, through Display.')).toBeInTheDocument();
    expect(option(/moved into t/).closest('label')).toHaveTextContent('✓');
    expect(stored()['test-moved-string']).toMatchObject({ firstChoice: 0, correctFirstTry: true });

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['✓ Borrow instead', '~ Clone it', '✕ Use a crate']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Idiomatic');
    expect(panel).toHaveTextContent('Take a & reference.');
    expect(within(panel).getByText('compiles')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next drill' })).not.toBeInTheDocument();
  });

  test('choosing a wrong diagnosis marks it and points at the right one', async () => {
    const { user } = await renderDrill();
    await user.click(option(/not mutable/));
    expect(screen.getByRole('status')).toHaveTextContent('Not quite. The correct diagnosis is marked above.');
    expect(option(/not mutable/).closest('label')).toHaveTextContent('✕');
    expect(option(/moved into t/).closest('label')).toHaveTextContent('✓');
    expect(option(/cannot print/).closest('label')).not.toHaveTextContent(/[✓✕]/);
    expect(stored()['test-moved-string']).toMatchObject({ firstChoice: 2, correctFirstTry: false });
  });

  test('each fix tab shows its verdict, note and checked code', async () => {
    const { user } = await renderDrill();
    await user.click(option(/moved into t/));
    await user.click(screen.getByRole('tab', { name: /Clone it/ }));
    expect(screen.getByRole('tab', { name: /Clone it/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Borrow instead/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Compiles, but');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('An extra allocation.');

    await user.click(screen.getByRole('tab', { name: /Use a crate/ }));
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Still wrong');
    expect(within(panel).getByText('not compiled: needs crates')).toHaveAttribute('title', 'needs the magic crate');
  });

  test('switching fix tabs shows that fix’s own code, not the previous one as an edit', async () => {
    const { user } = await renderDrill({}, 'runner');
    await user.click(option(/moved into t/));
    const panel = () => screen.getByRole('tabpanel');
    expect(await within(panel()).findByRole('button', { name: 'Run' })).toBeInTheDocument();
    expect(panel()).toHaveTextContent('let t = &s;');
    await user.click(screen.getByRole('tab', { name: /Clone it/ }));
    expect(panel()).toHaveTextContent('let t = s.clone();');
    expect(within(panel()).queryByText('edited')).not.toBeInTheDocument();
    expect(within(panel()).getByText('compiles')).toBeInTheDocument();
  });

  test('Reset hides the answer; the recorded first try shows as missed last time and is not overwritten', async () => {
    const { user } = await renderDrill();
    await user.click(option(/cannot print/));
    await user.click(screen.getByRole('tab', { name: /Use a crate/ }));
    await user.click(screen.getByRole('button', { name: 'Reset this drill' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeEnabled();
      expect(radio).not.toBeChecked();
    }
    expect(screen.getByText('missed last time')).toHaveClass('text-ochre');

    await user.click(option(/moved into t/));
    expect(screen.queryByText('missed last time')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Borrow instead/ })).toHaveAttribute('aria-selected', 'true');
    expect(stored()['test-moved-string'].correctFirstTry).toBe(false);
  });

  test('a drill solved on the first try earlier says so', async () => {
    localStorage.setItem('unmanaged.v1', JSON.stringify({ drills: { 'test-moved-string': { firstChoice: 0, correctFirstTry: true, at: 1 } } }));
    await renderDrill();
    expect(screen.getByText('solved before')).toHaveClass('text-verdigris');
  });

  test('offers a link to its own page and a Next button when asked', async () => {
    const onNext = vi.fn();
    const { user } = await renderDrill({ linkToPage: true, onNext, headingLevel: 2 });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Use after move');
    expect(screen.getByRole('link', { name: 'open on its own' })).toHaveAttribute('href', '#/drills/test-moved-string');
    await user.click(option(/moved into t/));
    await user.click(screen.getByRole('button', { name: 'Next drill' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  test('a panic drill labels the output as a run and underlines the panicking call', async () => {
    const code = ['fn main() {', '    let v: Vec<i32> = Vec::new();', '    let first = v.first().unwrap();', '    println!("{first}");', '}'].join('\n');
    const panic = drill({
      id: 'test-panic',
      outcome: 'panic',
      errorCode: 'panic',
      code,
      message: "thread 'main' panicked at src/main.rs:3:17:\ncalled `Option::unwrap()` on a `None` value",
      question: 'Why does it panic?',
      csharpReflex: undefined,
    });
    const { container } = await renderDrill({ drill: panic });
    expect(screen.getByText('cargo run (compiles, then panics)')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Why does it panic?' })).toBeInTheDocument();
    expect(screen.queryByText('The C# reflex:')).not.toBeInTheDocument();
    expect(gutter(container).map((g) => g.classList.contains('border-danger'))).toEqual([false, false, true, false, false]);
    expect([...container.querySelectorAll('figure .mark-primary')].map((m) => m.textContent).join('')).toBe('v.first()');
  });

  test('a drill without fixes shows no fix panel after answering', async () => {
    const { user } = await renderDrill({ drill: drill({ fixes: [] }) });
    await user.click(option(/moved into t/));
    expect(screen.getByRole('region', { name: 'Fixes' })).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  test('without a backend the code cannot be edited or run', async () => {
    await renderDrill({}, 'none');
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
  });

  test('editing the code drops the error marks and relabels the compiler output; Run sends the edit', async () => {
    const { user, container, fetchMock, d } = await renderDrill({}, 'runner');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const editor = screen.getByRole('textbox', { name: /Edit Rust code/ });
    await user.clear(editor);
    await user.type(editor, 'fn main() {{}');
    expect(screen.getByText('edited: try your own fix')).toBeInTheDocument();
    expect(screen.getByText('cargo build, for the original code')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(container.querySelector('figure .mark-primary')).toBeNull();
    expect(gutter(container)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText(/ran successfully, your edited version/)).toBeInTheDocument();
    expect(callsTo(fetchMock, '/api/run')).toEqual([{ language: 'rust', code: 'fn main() {}' }]);

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByText('edited: try your own fix')).not.toBeInTheDocument();
    expect(screen.getByText('cargo build')).toBeInTheDocument();
    expect(gutter(container)).toHaveLength(d.code.split('\n').length);
  });

  test('renders a real drill from the content', async () => {
    const real = allDrills[0];
    const { user } = await renderDrill({ drill: real });
    expect(screen.getByRole('article', { name: `Drill: ${real.title}` })).toBeInTheDocument();
    const correct = real.options.find((o) => o.correct)!;
    const radio = screen.getAllByRole('radio').find((r) => r.closest('label')!.textContent === correct.text.replace(/`|\*\*/g, ''))!;
    await user.click(radio);
    expect(screen.getByRole('status')).toHaveTextContent('Right diagnosis.');
  });
});
