import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { snippetById } from '../../src/content/borrow/index.ts';
import type { BorrowSnippet } from '../../src/content/types';
import { callsTo, fresh, mockFetch, type RunnerMode } from './runnerFetch';

const real = (id: string) => snippetById.get(id)!;

/** Compile conflict between two borrows, spans with and without labels, and every readout state. */
const edge: BorrowSnippet = {
  id: 'edge',
  title: 'Edge cases',
  summary: 'A `crafted` snippet.',
  code: ['fn main() {', '    let mut v = vec![1];', '', '    let r = &mut v;', '    v.push(2);', '    r.push(3);', '}'].join('\n'),
  spans: [
    { variable: 'v', kind: 'owned', startLine: 2, endLine: 7 },
    { variable: 'v', kind: 'borrow_mut', startLine: 4, endLine: 6, label: 'r = &mut v' },
    { variable: 'v', kind: 'borrow', startLine: 5, endLine: 5 },
    { variable: 'x', kind: 'moved', startLine: 2, endLine: 3, label: 'moved into y' },
    { variable: 'x', kind: 'borrow', startLine: 5, endLine: 5, label: 'late read' },
    { variable: 'y', kind: 'owned', startLine: 4, endLine: 5, label: 'takes x' },
    { variable: 'y', kind: 'borrow_mut', startLine: 4, endLine: 4, label: 'mutated' },
    { variable: 'z', kind: 'borrow', startLine: 2, endLine: 2, label: 'a static' },
  ],
  conflicts: [
    {
      spans: [1, 2],
      errorCode: 'E0499',
      message: [
        'error[E0499]: cannot borrow `v` as mutable more than once at a time',
        ' --> src/main.rs:5:5',
        '  |',
        '4 |     let r = &mut v;',
        '  |             ------ first mutable borrow occurs here',
        '5 |     v.push(2);',
        '  |     ^ -------- second borrow',
        '6 |     r.push(3);',
        '  |     - first borrow later used here',
      ].join('\n'),
      explanation: 'Two `&mut` at once.',
    },
  ],
};

/** Runtime conflicts only, including panic messages without the usual shape. */
const runtimeEdge: BorrowSnippet = {
  id: 'runtime-edge',
  title: 'Runtime edge cases',
  summary: 'Panics.',
  variables: ['c'],
  code: ['fn main() {', '    let c = RefCell::new(1);', '    c.borrow_mut();', '}'].join('\n'),
  spans: [
    { variable: 'c', kind: 'owned', startLine: 2, endLine: 4, label: 'owns' },
    { variable: 'c', kind: 'borrow_mut', checked: 'runtime', startLine: 3, endLine: 3 },
  ],
  conflicts: [
    { spans: [0, 1], errorCode: 'panic', phase: 'runtime', message: "thread 'main' panicked at src/main.rs:3:5:", explanation: 'Header only.' },
    { spans: [1, 0], errorCode: 'panic', phase: 'runtime', message: '\nno header here', explanation: 'No header.' },
  ],
};

/** Compiles, no takeaway, C# without a note, nothing paired. */
const plain: BorrowSnippet = {
  id: 'plain',
  title: 'Plain',
  summary: 'Nothing happens.',
  code: ['fn main() {', '    let n = 1;', '}'].join('\n'),
  spans: [{ variable: 'n', kind: 'owned', startLine: 2, endLine: 3 }],
  conflicts: [],
  csharpEquivalent: 'var n = 1;',
};

async function renderVisualizer(snippet: BorrowSnippet, { mode = 'none' as RunnerMode, bare = false, headingLevel = undefined as 2 | 3 | undefined } = {}) {
  const fetchMock = mockFetch({
    mode,
    playground: () => ({ success: true, exitDetail: 'Exited with status 0', stdout: 'Billing: Contoso Ltd\n', stderr: '     Running `target/debug/playground`\n' }),
  });
  const { BorrowVisualizer } = await fresh(() => import('../../src/components/BorrowVisualizer'));
  const utils = render(<BorrowVisualizer snippet={snippet} bare={bare} headingLevel={headingLevel} />);
  return { ...utils, fetchMock, user: userEvent.setup() };
}

const grid = () => screen.getByRole('group', { name: /Arrow keys move the line cursor/ });
const readout = () => document.querySelector<HTMLElement>('[aria-live="polite"]')!;
const cursorLine = () => within(readout()).getByText(/^line \d+$/).textContent;
const stateOf = (variable: string) => within(readout()).getByText(variable, { selector: 'dt' }).nextElementSibling as HTMLElement;
const bars = () => [...document.querySelectorAll<SVGGElement>('svg[role="img"] g.cursor-help')];
const bar = (title: string) => bars().find((g) => g.querySelector('title')!.textContent === title)!;
const gutterNumbers = () => [...grid().querySelectorAll<HTMLElement>(':scope > div > span')];
const highlights = () => [...grid().querySelectorAll<HTMLElement>(':scope > div[aria-hidden="true"]')];
const card = (text: RegExp) => screen.getAllByRole('article').find((a) => text.test(a.textContent ?? ''))!;

describe('BorrowVisualizer', () => {
  describe('layout and header', () => {
    test('a failing snippet shows its title, summary, error status, tracks and legend', async () => {
      await renderVisualizer(real('move-on-assign'));
      expect(screen.getByRole('region', { name: 'Borrow visualizer: Assignment moves a String' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: 'Assignment moves a String' })).toBeInTheDocument();
      expect(screen.getByText('does not compile: E0382')).toBeInTheDocument();
      expect(screen.getByRole('img')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('customer: owned until moved lines 2 to 3 (owns the String until line 3 moves it into billing_name). billing_name: owned until dropped lines 3 to 6'),
      );
      const legend = screen.getByRole('list', { name: 'Legend' });
      expect([...legend.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
        'owned',
        '& shared borrow',
        '&mut exclusive borrow',
        'moved (cut)',
        'dropped (fade)',
        'conflict',
      ]);
      // One vertical label per track, in the declared order.
      expect([...document.querySelectorAll('span.whitespace-nowrap[title]')].map((s) => s.textContent)).toEqual(['customer', 'billing_name']);
    });

    test('a compiling snippet says so and uses an h2 when asked', async () => {
      await renderVisualizer(real('borrow-on-assign'), { headingLevel: 2 });
      expect(screen.getByRole('heading', { level: 2, name: 'Borrow instead of move' })).toBeInTheDocument();
      expect(screen.getByText('compiles')).toBeInTheDocument();
    });

    test('a runtime conflict is reported as a panic, and the legend explains dashed runtime borrows', async () => {
      await renderVisualizer(real('refcell-double-borrow'));
      expect(screen.getByText('compiles, panics at runtime')).toBeInTheDocument();
      expect(within(screen.getByRole('list', { name: 'Legend' })).getByText('checked at runtime (RefCell)')).toBeInTheDocument();
    });

    test('bare mode hides the header', async () => {
      await renderVisualizer(real('borrow-on-assign'), { bare: true });
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
      expect(screen.queryByText('compiles')).not.toBeInTheDocument();
    });

    test('the primary error line gets a red gutter and rustc underlines on the code', async () => {
      await renderVisualizer(real('move-on-assign'));
      expect(gutterNumbers().map((g) => g.classList.contains('border-danger'))).toEqual([false, false, false, false, true, false]);
      expect(grid().querySelectorAll('.mark-secondary')).not.toHaveLength(0);
      expect(grid().querySelector('.mark-primary')).toHaveAttribute('title', 'value borrowed here after move');
    });
  });

  describe('line cursor', () => {
    test('starts on the primary error line', async () => {
      await renderVisualizer(real('move-on-assign'));
      expect(cursorLine()).toBe('line 5');
      expect(screen.getByRole('slider', { name: 'Line cursor' })).toHaveValue('5');
      expect(gutterNumbers()[4]).toHaveClass('text-strong');
    });

    test('without errors, starts where the most spans overlap', async () => {
      await renderVisualizer(real('borrow-on-assign'));
      expect(cursorLine()).toBe('line 3');
    });

    test('starts on a primary mark even when an earlier line only has secondary marks', async () => {
      await renderVisualizer(edge);
      expect(cursorLine()).toBe('line 5');
    });

    test('keyboard: arrows, j/k, Home and End move and clamp; other keys are ignored', async () => {
      const { user } = await renderVisualizer(real('move-on-assign'));
      grid().focus();
      await user.keyboard('{ArrowUp}');
      expect(cursorLine()).toBe('line 4');
      await user.keyboard('k');
      expect(cursorLine()).toBe('line 3');
      await user.keyboard('{ArrowDown}');
      expect(cursorLine()).toBe('line 4');
      await user.keyboard('j');
      expect(cursorLine()).toBe('line 5');
      await user.keyboard('{End}');
      expect(cursorLine()).toBe('line 6');
      await user.keyboard('{ArrowDown}');
      expect(cursorLine()).toBe('line 6');
      await user.keyboard('{Home}');
      expect(cursorLine()).toBe('line 1');
      await user.keyboard('{ArrowUp}');
      expect(cursorLine()).toBe('line 1');

      const ignored = fireEvent.keyDown(grid(), { key: 'x' });
      expect(ignored).toBe(true); // not prevented
      expect(cursorLine()).toBe('line 1');
      const handled = fireEvent.keyDown(grid(), { key: 'j' });
      expect(handled).toBe(false); // prevented, so the page does not scroll
    });

    test('pointer: moving or pressing over the code puts the cursor on that row', async () => {
      await renderVisualizer(real('move-on-assign'));
      const el = grid();
      el.getBoundingClientRect = () => ({ top: 100, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 100, toJSON: () => ({}) });
      fireEvent.pointerMove(el, { clientY: 100 + 28 * 1 + 5 });
      expect(cursorLine()).toBe('line 2');
      fireEvent.pointerDown(el, { clientY: 100 + 28 * 3 });
      expect(cursorLine()).toBe('line 4');
      // Outside the rows: unchanged.
      fireEvent.pointerMove(el, { clientY: 90 });
      fireEvent.pointerMove(el, { clientY: 100 + 28 * 6 });
      expect(cursorLine()).toBe('line 4');
    });

    test('the mobile slider moves the cursor', async () => {
      await renderVisualizer(real('move-on-assign'));
      const slider = screen.getByRole('slider', { name: 'Line cursor' });
      expect(slider).toHaveAttribute('max', '6');
      fireEvent.change(slider, { target: { value: '2' } });
      expect(cursorLine()).toBe('line 2');
    });
  });

  describe('readout', () => {
    test('describes owned, moved-away and conflicting states on real code', async () => {
      await renderVisualizer(real('move-on-assign'));
      expect(within(readout()).getByText('println!("Customer: {customer}");')).toBeInTheDocument();
      expect(stateOf('customer')).toHaveTextContent('✕ moved out on line 3, then & borrowed — println! tries to borrow customer, which no longer owns anything');
      expect(stateOf('customer').firstChild).toHaveClass('text-danger');
      expect(readout()).toHaveTextContent('error[E0382]: borrow of moved value: `customer`');

      fireEvent.change(screen.getByRole('slider'), { target: { value: '3' } });
      expect(stateOf('customer')).toHaveTextContent('moved away on this line');
      expect(stateOf('customer').firstChild).toHaveClass('text-oxide-text');
      expect(stateOf('billing_name')).toHaveTextContent('owned — new owner; the String is freed at the end of main');
      expect(readout()).not.toHaveTextContent('error[');

      fireEvent.change(screen.getByRole('slider'), { target: { value: '6' } });
      expect(stateOf('billing_name')).toHaveTextContent('dropped on this line');
    });

    test('describes handover on reassignment', async () => {
      await renderVisualizer(real('assign-while-borrowed'));
      expect(cursorLine()).toBe('line 4');
      expect(stateOf('connection_string')).toHaveTextContent('old value dropped, new value owned, & borrowed');
    });

    test('describes shared, exclusive, gone, not-declared and out-of-scope states', async () => {
      await renderVisualizer(edge);
      const slider = screen.getByRole('slider');
      // Line 5: v in conflict, x gone then borrowed, y owned.
      expect(stateOf('v')).toHaveTextContent('✕ owned, &mut borrowed and & borrowed — r = &mut v');
      expect(stateOf('x')).toHaveTextContent('moved out on line 3, then & borrowed — late read');
      expect(stateOf('x').firstChild).toHaveClass('text-steel');
      expect(stateOf('y')).toHaveTextContent('owned — takes x');

      fireEvent.change(slider, { target: { value: '4' } });
      expect(stateOf('x')).toHaveTextContent('moved out on line 3');
      expect(stateOf('x').firstChild).toHaveClass('line-through');
      expect(stateOf('y')).toHaveTextContent('owned, &mut borrowed — takes x; mutated');
      expect(stateOf('y').firstChild).toHaveClass('text-ochre');

      fireEvent.change(slider, { target: { value: '3' } });
      expect(within(readout()).getByText('(blank)')).toBeInTheDocument();
      expect(stateOf('y')).toHaveTextContent('not declared yet');
      expect(stateOf('y').firstChild).toHaveClass('text-muted/70');

      fireEvent.change(slider, { target: { value: '2' } });
      // A span without a label adds no details.
      expect(stateOf('v').textContent).toBe('owned');

      // z only ever had a borrow, which has ended.
      expect(stateOf('z')).toHaveTextContent('out of scope');

      fireEvent.change(slider, { target: { value: '6' } });
      expect(stateOf('y')).toHaveTextContent('dropped on line 5');
    });

    test('lists every live conflict, using the panic message for runtime ones', async () => {
      await renderVisualizer(runtimeEdge);
      expect(cursorLine()).toBe('line 3');
      expect(readout()).toHaveTextContent(
        "panics here at runtime: thread 'main' panicked at src/main.rs:3:5: / panics here at runtime: no header here",
      );
    });
  });

  describe('bars', () => {
    test('every bar kind is drawn with a title, and conflicting bars are hatched', async () => {
      await renderVisualizer(edge);
      const titles = bars().map((g) => g.querySelector('title')!.textContent);
      expect(titles).toEqual([
        'v: owned, lines 2–7',
        'v: mutable borrow, lines 4–6. r = &mut v',
        'v: shared borrow, lines 5–5',
        'x: owned until moved, lines 2–3. moved into y',
        'x: shared borrow, lines 5–5. late read',
        'y: owned, lines 4–5. takes x',
        'y: mutable borrow, lines 4–4. mutated',
        'z: shared borrow, lines 2–2. a static',
      ]);
      const hatched = (g: SVGGElement) => [...g.querySelectorAll('rect')].some((r) => r.getAttribute('fill')?.endsWith('-hatch)'));
      expect(bars().map(hatched)).toEqual([false, true, true, false, false, false, false, false]);
      expect(bar('x: owned until moved, lines 2–3. moved into y').querySelector('polygon')).toBeInTheDocument();
      // Tracks after the first are separated by a dashed rule.
      expect(document.querySelectorAll('svg[role="img"] > g > line')).toHaveLength(3);
    });

    test('dropped bars fade out and moved bars end in a cut', async () => {
      await renderVisualizer(real('move-on-assign'));
      expect(bar('billing_name: owned until dropped, lines 3–6. new owner; the String is freed at the end of main').querySelector('mask')).toBeInTheDocument();
      expect(bar('customer: owned until moved, lines 2–3. owns the String until line 3 moves it into billing_name').querySelector('polygon')).toHaveAttribute(
        'stroke-width',
        '2',
      );
    });

    test('runtime-checked borrows are dashed, and a runtime &mut is lighter', async () => {
      await renderVisualizer(real('refcell-double-borrow'));
      const shared = bars().find((g) => g.querySelector('title')!.textContent!.startsWith('cart: shared borrow'))!;
      const exclusive = bars().find((g) => g.querySelector('title')!.textContent!.startsWith('cart: mutable borrow'))!;
      expect(shared.querySelectorAll('rect')[1]).toHaveAttribute('stroke-dasharray', '3 2');
      expect(exclusive.querySelectorAll('rect')[1]).toHaveAttribute('stroke-dasharray', '3 2');
      expect(exclusive.querySelectorAll('rect')[1].getAttribute('fill')).toContain('color-mix');
    });

    test('hovering a bar highlights its lines, dims the others and describes it', async () => {
      const { user } = await renderVisualizer(edge);
      const target = bar('v: mutable borrow, lines 4–6. r = &mut v');
      await user.hover(target);
      expect(readout()).toHaveTextContent('v mutable borrow, lines 4–6: r = &mut v');
      expect(highlights()).toHaveLength(1);
      expect(highlights()[0].style.top).toBe(`${3 * 28}px`);
      expect(highlights()[0].style.height).toBe(`${3 * 28}px`);
      expect(target).toHaveAttribute('opacity', '1');
      expect(bar('v: owned, lines 2–7')).toHaveAttribute('opacity', '0.3');

      await user.unhover(target);
      expect(highlights()).toHaveLength(0);
      expect(bar('v: owned, lines 2–7')).toHaveAttribute('opacity', '1');

      await user.hover(bar('v: owned, lines 2–7'));
      const hover = readout().querySelector('p:last-child')!;
      expect(hover.textContent).toBe('v owned, lines 2–7');
    });
  });

  describe('conflict cards', () => {
    test('a compile conflict shows the code, both spans, rustc output, explanation and an explain link', async () => {
      await renderVisualizer(real('move-on-assign'));
      const c = card(/E0382/);
      expect(c).toHaveTextContent('E0382 borrow of moved value: `customer`');
      const items = [...c.querySelectorAll('li')].map((li) => li.textContent);
      expect(items).toEqual([
        'customer owned until moved, line 2–3: owns the String until line 3 moves it into billing_name',
        'customer shared borrow, line 5: println! tries to borrow customer, which no longer owns anything',
      ]);
      expect(within(c).getByRole('link', { name: 'rustc --explain E0382' })).toHaveAttribute('href', 'https://doc.rust-lang.org/error_codes/E0382.html');
      expect(c.querySelector('pre')).toHaveTextContent('value moved here');
      expect(c).toHaveTextContent('transfers ownership of the heap buffer');
    });

    test('spans without labels are listed without one', async () => {
      await renderVisualizer(edge);
      expect([...card(/E0499/).querySelectorAll('li')].map((li) => li.textContent)).toEqual(['v mutable borrow, line 4–6: r = &mut v', 'v shared borrow, line 5']);
    });

    test('highlighting both spans moves the cursor to the later one, and clearing restores', async () => {
      const { user } = await renderVisualizer(real('move-on-assign'));
      fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } });
      const c = card(/E0382/);
      const toggle = within(c).getByRole('button', { name: 'Highlight both spans' });
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(toggle).toHaveTextContent('Clear highlight');
      expect(c).toHaveClass('border-danger');
      expect(cursorLine()).toBe('line 5');
      expect(highlights().map((h) => h.style.top)).toEqual([`${1 * 28}px`, `${4 * 28}px`]);
      expect(bar('billing_name: shared borrow, lines 4–4. println! borrows billing_name')).toHaveAttribute('opacity', '0.3');

      // Hovering while a conflict is selected adds that range, but emphasis stays on the conflict.
      await user.hover(bar('billing_name: shared borrow, lines 4–4. println! borrows billing_name'));
      expect(highlights()).toHaveLength(3);
      expect(bar('billing_name: shared borrow, lines 4–4. println! borrows billing_name')).toHaveAttribute('opacity', '0.3');
      await user.unhover(bar('billing_name: shared borrow, lines 4–4. println! borrows billing_name'));

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(highlights()).toHaveLength(0);
      expect(c).not.toHaveClass('border-danger');
    });

    test('the later span can be listed first in the conflict', async () => {
      const { user } = await renderVisualizer(real('assign-while-borrowed'));
      fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } });
      await user.click(screen.getByRole('button', { name: 'Highlight both spans' }));
      expect(cursorLine()).toBe('line 3');
    });

    test('a runtime conflict shows the panic without an explain link', async () => {
      await renderVisualizer(real('refcell-double-borrow'));
      const c = screen.getByRole('article');
      expect(c).toHaveTextContent('panic RefCell already borrowed');
      expect(within(c).queryByRole('link')).not.toBeInTheDocument();
      expect(readout()).toHaveTextContent('panics here at runtime: RefCell already borrowed');
    });

    test('panic headers fall back to the header line, or to the whole message', async () => {
      await renderVisualizer(runtimeEdge);
      const [first, second] = screen.getAllByRole('article');
      expect(first.querySelector('p')).toHaveTextContent("panic thread 'main' panicked at src/main.rs:3:5:");
      expect(second.querySelector('p')).toHaveTextContent('panic no header here');
    });
  });

  describe('after the tracks', () => {
    test('a compiling snippet shows its takeaway and links to the version that does not compile', async () => {
      await renderVisualizer(real('borrow-on-assign'));
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
      expect(screen.getByText(/is a/).closest('p')).toHaveTextContent('billing_name is a &String');
      expect(screen.getByText('The version that does not compile:', { exact: false })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Assignment moves a String' })).toHaveAttribute('href', '#/visualizer/move-on-assign');
      expect(screen.queryByText('The same thing in C#')).not.toBeInTheDocument();
    });

    test('a failing snippet shows the C# equivalent with its note and links to the compiling version', async () => {
      const { user } = await renderVisualizer(real('move-on-assign'));
      const summary = screen.getByText('The same thing in C#');
      const details = summary.closest('details')!;
      expect(details).not.toHaveAttribute('open');
      await user.click(summary);
      expect(details).toHaveAttribute('open');
      expect(within(details).getByText('Program.cs', { exact: false })).toBeInTheDocument();
      expect(within(details).getByText('Compiles and runs. Two references, one object; the GC counts both.')).toBeInTheDocument();
      expect(screen.getByText('The version that compiles:', { exact: false })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Borrow instead of move' })).toHaveAttribute('href', '#/visualizer/borrow-on-assign');
    });

    test('without a takeaway or pairing, only the C# block is shown, without a note', async () => {
      const { container } = await renderVisualizer(plain);
      const details = container.querySelector('details')!;
      expect(details.querySelectorAll('p')).toHaveLength(0);
      expect(screen.queryByText(/The version that/)).not.toBeInTheDocument();
      expect(container.querySelector('.border-verdigris')).toBeNull();
    });

    test('with nothing extra, nothing is rendered after the legend', async () => {
      await renderVisualizer(runtimeEdge);
      expect(screen.queryByText('The same thing in C#')).not.toBeInTheDocument();
      expect(screen.queryByText(/The version that/)).not.toBeInTheDocument();
    });
  });

  describe('running', () => {
    test('without a backend there is no Run button and no editable copy', async () => {
      await renderVisualizer(real('move-on-assign'), { mode: 'none' });
      await new Promise((r) => setTimeout(r, 10));
      expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit a copy and run it' })).not.toBeInTheDocument();
    });

    test('Run sends the original code to the playground and shows the output', async () => {
      const { user, fetchMock } = await renderVisualizer(real('borrow-on-assign'), { mode: 'playground' });
      const run = await screen.findByRole('button', { name: 'Run' });
      expect(run).toHaveAttribute('title', 'Run (on play.rust-lang.org)');
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      await user.click(run);
      expect(await screen.findByText('ran successfully')).toBeInTheDocument();
      expect(screen.getByText('Billing: Contoso Ltd')).toBeInTheDocument();
      expect(callsTo(fetchMock, 'https://play.rust-lang.org/execute')[0].code).toBe(real('borrow-on-assign').code);
    });

    test('"Edit a copy" opens an editable copy below the tracks and closes again', async () => {
      const { user } = await renderVisualizer(real('move-on-assign'), { mode: 'playground' });
      const toggle = await screen.findByRole('button', { name: 'Edit a copy and run it' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(toggle).toHaveTextContent('Close the editable copy');
      expect(screen.getByText(/The tracks above are drawn for the original code/)).toBeInTheDocument();
      const copy = screen.getByText('main.rs (copy)', { exact: false }).closest('figure')!;
      await user.click(within(copy).getByRole('button', { name: 'Edit' }));
      expect(within(copy).getByRole('textbox', { name: /Edit Rust code/ })).toHaveValue(real('move-on-assign').code);
      await user.click(toggle);
      expect(screen.queryByText(/main.rs \(copy\)/)).not.toBeInTheDocument();
    });
  });
});
