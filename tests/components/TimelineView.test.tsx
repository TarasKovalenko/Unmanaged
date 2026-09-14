import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { allTimelines } from '../../src/content/timelines/index.ts';
import type { Timeline } from '../../src/content/types';
import { callsTo, fresh, mockFetch, runnerResult, type RunnerMode } from './runnerFetch';

function timeline(overrides: Partial<Timeline> = {}, rust: Partial<Timeline['rust']> = {}): Timeline {
  return {
    id: 'tl',
    title: 'Hot tasks, cold futures',
    summary: 'A `Task` starts at once; a future waits to be polled.',
    ticks: 4,
    tickNotes: ['Note: start', 'Note: call', 'Note: await', 'Note: done'],
    csharp: {
      filename: 'Program.cs',
      code: ['var t = Send();', 'Console.WriteLine("placed");', 'await t;'].join('\n'),
      lineAtTick: [1, 2, 3, 0],
      output: 'placed\nsent',
      events: [
        { lane: 'Main', kind: 'running', start: 0, end: 1 },
        { lane: 'Main', kind: 'waiting', start: 2, end: 2, label: 'await t' },
        { lane: 'Main', kind: 'done', start: 3, end: 3 },
        { lane: 'SendReceiptAsyncWithRetry', kind: 'blocked', start: 1, end: 2, label: 'Thread.Sleep' },
      ],
    },
    rust: {
      filename: 'main.rs',
      code: ['fn main() {', '    let f = send();', '    println!("placed");', '    drop(f);', '}'].join('\n'),
      lineAtTick: [2, 3, 4],
      expect: 'compiles',
      events: [
        { lane: 'main', kind: 'running', start: 0, end: 3 },
        { lane: 'send()', kind: 'inert', start: 0, end: 2, label: 'never polled' },
        { lane: 'send()', kind: 'dropped', start: 3, end: 3 },
      ],
      ...rust,
    },
    explanation: ['Nothing happens until a future is **polled**.'],
    ...overrides,
  };
}

async function renderTimeline(t: Timeline = timeline(), mode: RunnerMode = 'none', headingLevel?: 2 | 3) {
  const fetchMock = mockFetch({ mode, run: (req) => runnerResult({ toolchain: req.language, execution: { stdout: `${req.language} ran\n` } }) });
  const { TimelineView } = await fresh(() => import('../../src/components/TimelineView'));
  const utils = render(<TimelineView timeline={t} headingLevel={headingLevel} />);
  return { ...utils, fetchMock };
}

const stepLabel = () => screen.getByText(/^step \d+\/\d+$/);
const panes = () => [...document.querySelectorAll<HTMLElement>('section > .grid > div')];
const csharpPane = () => panes()[0];
const rustPane = () => panes()[1];
const activeLine = (pane: HTMLElement) => pane.querySelector('pre > div.bg-raised')?.getAttribute('data-line') ?? null;
const laneStates = (pane: HTMLElement) =>
  [...pane.querySelectorAll('ul[aria-live] li')].map((li) => li.textContent);

afterEach(() => {
  vi.useRealTimers();
});

describe('TimelineView', () => {
  test('renders the title, summary, explanation, both panes and the legend', async () => {
    await renderTimeline();
    expect(screen.getByRole('heading', { level: 3, name: 'Hot tasks, cold futures' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Async timeline: Hot tasks, cold futures' })).toHaveTextContent('A Task starts at once');
    expect(screen.getByText('polled')).toContainHTML('strong');
    expect(csharpPane()).toHaveTextContent('C# Program.cs');
    expect(csharpPane()).toHaveTextContent('output verified by running it');
    expect(rustPane()).toHaveTextContent('Rust main.rs');
    expect(within(rustPane()).getByText('compiles')).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Legend' });
    // Each item is a swatch followed by its text.
    expect([...legend.querySelectorAll('li')].map((li) => li.lastChild?.textContent)).toEqual([
      'running',
      'suspended, waiting',
      'created, never polled',
      'blocking its thread',
      'finished',
      'dropped without finishing',
    ]);
  });

  test('uses an h2 when asked', async () => {
    await renderTimeline(timeline(), 'none', 2);
    expect(screen.getByRole('heading', { level: 2, name: 'Hot tasks, cold futures' })).toBeInTheDocument();
  });

  test('the lanes describe every event with its label, and the chart summarises them', async () => {
    await renderTimeline();
    expect(laneStates(csharpPane())).toEqual(['Mainrunning', 'SendReceiptAsyncWithRetrynot involved at this step']);
    expect(laneStates(rustPane())).toEqual(['mainrunning', 'send()created, never polled: never polled']);
    const chart = within(csharpPane()).getByRole('img');
    expect(chart).toHaveAttribute(
      'aria-label',
      'Main running from step 1 to 2. Main suspended, waiting from step 3 to 3: await t. Main finished from step 4 to 4. SendReceiptAsyncWithRetry blocking its thread from step 2 to 3: Thread.Sleep',
    );
    // Long lane names are shortened in the chart, with the full name as a tooltip.
    const label = [...chart.querySelectorAll('text')].map((t) => t.textContent);
    expect(label).toEqual(['MainMain', 'SendReceiptAsync…SendReceiptAsyncWithRetry']);
    const titles = [...chart.querySelectorAll('g > title')].map((t) => t.textContent);
    expect(titles).toContain('Main: suspended, waiting. await t');
    expect(titles).toContain('Main: running');
  });

  test('step buttons move the shared clock and stop at both ends', async () => {
    const user = userEvent.setup();
    await renderTimeline();
    const prev = screen.getByRole('button', { name: 'Previous step' });
    const next = screen.getByRole('button', { name: 'Next step' });
    expect(stepLabel()).toHaveTextContent('step 1/4');
    expect(prev).toBeDisabled();
    expect(screen.getByText('Note: start')).toBeInTheDocument();
    expect(activeLine(csharpPane())).toBe('1');
    expect(activeLine(rustPane())).toBe('2');

    await user.click(next);
    expect(stepLabel()).toHaveTextContent('step 2/4');
    expect(screen.getByText('Note: call')).toBeInTheDocument();
    expect(laneStates(csharpPane())[1]).toBe('SendReceiptAsyncWithRetryblocking its thread: Thread.Sleep');

    await user.click(next);
    await user.click(next);
    expect(stepLabel()).toHaveTextContent('step 4/4');
    expect(next).toBeDisabled();
    // Tick 4 has no C# line (0) and no Rust entry at all.
    expect(activeLine(csharpPane())).toBeNull();
    expect(activeLine(rustPane())).toBeNull();
    expect(laneStates(rustPane())).toEqual(['mainrunning', 'send()dropped without finishing']);

    await user.click(prev);
    expect(stepLabel()).toHaveTextContent('step 3/4');
  });

  test('Play advances every 1.1 s, stops at the end, and Replay starts over', async () => {
    vi.useFakeTimers();
    await renderTimeline();
    const play = screen.getByRole('button', { name: 'Play' });
    fireEvent.click(play);
    expect(play).toHaveTextContent('Pause');
    act(() => vi.advanceTimersByTime(1099));
    expect(stepLabel()).toHaveTextContent('step 1/4');
    act(() => vi.advanceTimersByTime(1));
    expect(stepLabel()).toHaveTextContent('step 2/4');
    act(() => vi.advanceTimersByTime(1100));
    act(() => vi.advanceTimersByTime(1100));
    expect(stepLabel()).toHaveTextContent('step 4/4');
    expect(play).toHaveTextContent('Replay');
    act(() => vi.advanceTimersByTime(5000));
    expect(stepLabel()).toHaveTextContent('step 4/4');

    fireEvent.click(play);
    expect(stepLabel()).toHaveTextContent('step 1/4');
    expect(play).toHaveTextContent('Pause');
    act(() => vi.advanceTimersByTime(1100));
    expect(stepLabel()).toHaveTextContent('step 2/4');

    fireEvent.click(play);
    expect(play).toHaveTextContent('Play');
    act(() => vi.advanceTimersByTime(5000));
    expect(stepLabel()).toHaveTextContent('step 2/4');
  });

  test('stepping or scrubbing pauses playback', async () => {
    vi.useFakeTimers();
    await renderTimeline();
    const play = screen.getByRole('button', { name: 'Play' });
    fireEvent.click(play);
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(play).toHaveTextContent('Play');
    act(() => vi.advanceTimersByTime(5000));
    expect(stepLabel()).toHaveTextContent('step 2/4');

    fireEvent.click(play);
    fireEvent.change(screen.getByRole('slider', { name: 'Time step' }), { target: { value: '0' } });
    expect(play).toHaveTextContent('Play');
    expect(stepLabel()).toHaveTextContent('step 1/4');
    act(() => vi.advanceTimersByTime(5000));
    expect(stepLabel()).toHaveTextContent('step 1/4');
  });

  test('the range input scrubs to a step', async () => {
    await renderTimeline();
    const slider = screen.getByRole('slider', { name: 'Time step' });
    expect(slider).toHaveAttribute('max', '3');
    fireEvent.change(slider, { target: { value: '2' } });
    expect(stepLabel()).toHaveTextContent('step 3/4');
    expect(screen.getByText('Note: await')).toBeInTheDocument();
    expect(activeLine(rustPane())).toBe('4');
  });

  test('clicking a column in either chart jumps to that step', async () => {
    const user = userEvent.setup();
    await renderTimeline();
    const columns = (pane: HTMLElement) => [...pane.querySelectorAll('rect.cursor-pointer')];
    expect(columns(rustPane()).map((c) => c.textContent)).toEqual(['Step 1', 'Step 2', 'Step 3', 'Step 4']);
    await user.click(columns(rustPane())[2]);
    expect(stepLabel()).toHaveTextContent('step 3/4');
    await user.click(columns(csharpPane())[1]);
    expect(stepLabel()).toHaveTextContent('step 2/4');
  });

  test('without tick notes there is no caption', async () => {
    await renderTimeline(timeline({ tickNotes: undefined }));
    expect(screen.queryByText('Note: start')).not.toBeInTheDocument();
    expect(document.querySelector('p[aria-live]')).toBeNull();
  });

  test('columns stretch to the measured width and the observer is disconnected on unmount', async () => {
    const disconnect = vi.fn();
    class WideObserver {
      constructor(private readonly cb: ResizeObserverCallback) {}
      observe(target: Element) {
        this.cb([{ target, contentRect: { width: 1540 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect = disconnect;
    }
    vi.stubGlobal('ResizeObserver', WideObserver);
    const { unmount } = await renderTimeline();
    // (1540 - 132 - 8) / 4 = 350 px per step
    expect(within(rustPane()).getByRole('img')).toHaveAttribute('width', String(132 + 4 * 350));
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  test('keeps the executing line in view inside the code pane', async () => {
    const user = userEvent.setup();
    const ROW = 20;
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return (Number(this.dataset.line ?? 1) - 1) * ROW;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(ROW);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(2 * ROW);
    const long = timeline({}, { code: Array.from({ length: 10 }, (_, i) => `// line ${i + 1}`).join('\n'), lineAtTick: [1, 2, 9, 1] });
    await renderTimeline(long);
    const pre = rustPane().querySelector('pre')!;
    const scrollTo = vi.mocked(pre.scrollTo);
    scrollTo.mockClear();

    await user.click(screen.getByRole('button', { name: 'Next step' })); // line 2: still visible
    expect(scrollTo).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Next step' })); // line 9: below the fold
    expect(scrollTo).toHaveBeenCalledWith({ top: 160 - (2 * ROW) / 3, behavior: 'smooth' });

    scrollTo.mockClear();
    pre.scrollTop = 160;
    await user.click(screen.getByRole('button', { name: 'Next step' })); // line 1: above
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  test('an unchecked Rust pane says why and cannot run, while C# can', async () => {
    const user = userEvent.setup();
    const { fetchMock } = await renderTimeline(timeline({}, { expect: 'unchecked', uncheckedReason: 'needs tokio' }), 'runner');
    expect(within(rustPane()).getByText('not compiled: needs crates')).toHaveAttribute('title', 'needs tokio');
    await user.click(await within(csharpPane()).findByRole('button', { name: 'Run' }));
    expect(await within(csharpPane()).findByText('csharp ran')).toBeInTheDocument();
    expect(within(rustPane()).queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
    expect(callsTo(fetchMock, '/api/run')).toHaveLength(1);
  });

  test('Run on each pane sends that pane’s code and shows output under it', async () => {
    const user = userEvent.setup();
    const t = timeline();
    const { fetchMock } = await renderTimeline(t, 'runner');
    expect(within(rustPane()).queryByText(/verified by running it/)).not.toBeInTheDocument();
    await user.click(await within(rustPane()).findByRole('button', { name: 'Run' }));
    expect(await within(rustPane()).findByText('rust ran')).toBeInTheDocument();
    expect(within(csharpPane()).queryByText('rust ran')).not.toBeInTheDocument();
    await user.click(within(csharpPane()).getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(within(csharpPane()).getByText('csharp ran')).toBeInTheDocument());
    expect(callsTo(fetchMock, '/api/run')).toEqual([
      { language: 'rust', code: t.rust.code },
      { language: 'csharp', code: t.csharp.code },
    ]);
    // The C# pane has verified output; this Rust pane does not.
    expect(within(csharpPane()).getByText('output (verified by running it)')).toBeInTheDocument();
    expect(within(rustPane()).queryByText('output (verified by running it)')).not.toBeInTheDocument();
  });

  test('renders a real timeline from the content', async () => {
    const real = allTimelines[0];
    await renderTimeline(real);
    expect(screen.getByRole('heading', { name: real.title })).toBeInTheDocument();
    expect(stepLabel()).toHaveTextContent(`step 1/${real.ticks}`);
    expect(screen.getByText(real.tickNotes![0])).toBeInTheDocument();
  });
});
