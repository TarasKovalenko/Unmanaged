import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { allDrills, drillById } from '../../src/content/drills';
import { tracks } from '../../src/content/tracks';
import { DrillsPage } from '../../src/pages/DrillsPage';
import { attempt, seedStorage } from './helpers';

beforeEach(() => seedStorage({}));

const drillList = () => screen.getAllByRole('list').find((ul) => ul.querySelector('a[href^="#/drills/"]') || ul.textContent?.includes('Nothing matches'))!;
const listedIds = () => within(drillList()).queryAllByRole('link').map((a) => a.getAttribute('href')!.replace('#/drills/', ''));
const drillSelect = () => screen.getByRole('combobox', { name: 'Drill' });
const trackSelect = () => screen.getByRole('combobox', { name: 'Track' });

async function answer(user: ReturnType<typeof userEvent.setup>) {
  const card = screen.getByRole('article', { name: /^Drill:/ });
  await user.click(within(card).getAllByRole('radio')[0]);
}

describe('DrillsPage', () => {
  test('selects the first drill and says none were tried', () => {
    render(<DrillsPage />);
    expect(screen.getByRole('heading', { level: 2, name: allDrills[0].title })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${allDrills.length} drills; none tried yet\\.`))).toBeInTheDocument();
    expect(listedIds()).toEqual(allDrills.map((d) => d.id));
    expect(within(drillList()).getByRole('link', { current: 'page' })).toHaveAttribute('href', `#/drills/${allDrills[0].id}`);
  });

  test('shows the drill from the route', () => {
    render(<DrillsPage drillId="own-e0502" />);
    expect(screen.getByRole('heading', { level: 2, name: drillById.get('own-e0502')!.title })).toBeInTheDocument();
    expect(drillSelect()).toHaveValue('own-e0502');
  });

  test('falls back to the first drill for an unknown id', () => {
    render(<DrillsPage drillId="nope" />);
    expect(screen.getByRole('heading', { level: 2, name: allDrills[0].title })).toBeInTheDocument();
  });

  test('counts tried and missed drills, ignoring attempts for drills that no longer exist', () => {
    seedStorage({ drills: { 'move-in-loop': attempt(false), 'own-e0499': attempt(true), 'removed-drill': attempt(false) } });
    render(<DrillsPage />);
    expect(screen.getByText(/you have tried 2, and 1 are worth another look\./)).toBeInTheDocument();
    const list = within(drillList());
    expect(list.getByRole('link', { name: /Notifying the same admin twice\s*missed/ })).toBeInTheDocument();
    expect(list.getByRole('link', { name: /Merging a stale session into the current one\s*solved/ })).toBeInTheDocument();
  });

  test('filters by track', async () => {
    const user = userEvent.setup();
    render(<DrillsPage />);
    const options = within(trackSelect()).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['All tracks', ...tracks.filter((t) => allDrills.some((d) => d.track === t.id)).map((t) => t.title)]);

    await user.selectOptions(trackSelect(), 'async');
    expect(listedIds()).toEqual(allDrills.filter((d) => d.track === 'async').map((d) => d.id));
  });

  test('filters by status: new, missed and solved', async () => {
    const user = userEvent.setup();
    seedStorage({ drills: { 'move-in-loop': attempt(false), 'own-e0499': attempt(true) } });
    render(<DrillsPage />);
    const status = within(screen.getByRole('radiogroup', { name: 'Filter by status' }));

    await user.click(status.getByRole('radio', { name: 'New' }));
    expect(status.getByRole('radio', { name: 'New' })).toHaveAttribute('aria-checked', 'true');
    expect(listedIds()).toEqual(allDrills.map((d) => d.id).filter((id) => id !== 'move-in-loop' && id !== 'own-e0499'));

    await user.click(status.getByRole('radio', { name: 'Missed' }));
    expect(listedIds()).toEqual(['move-in-loop']);

    await user.click(status.getByRole('radio', { name: 'Solved' }));
    expect(listedIds()).toEqual(['own-e0499']);

    await user.click(status.getByRole('radio', { name: 'All' }));
    expect(listedIds()).toHaveLength(allDrills.length);
  });

  test('says nothing matches when a filter has no results, and keeps the route drill in the mobile select', async () => {
    const user = userEvent.setup();
    render(<DrillsPage drillId="own-e0502" />);
    await user.click(screen.getByRole('radio', { name: 'Solved' }));
    expect(screen.getByText('Nothing matches this filter.')).toBeInTheDocument();
    expect(listedIds()).toEqual([]);
    const options = within(drillSelect()).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveValue('own-e0502');
  });

  test('without a route drill and no matches, the first drill stays selected', async () => {
    const user = userEvent.setup();
    render(<DrillsPage />);
    await user.click(screen.getByRole('radio', { name: 'Missed' }));
    expect(screen.getByRole('heading', { level: 2, name: allDrills[0].title })).toBeInTheDocument();
  });

  test('the mobile select adds the route drill in front when the filter hides it', async () => {
    const user = userEvent.setup();
    render(<DrillsPage drillId="move-in-loop" />);
    await user.selectOptions(trackSelect(), 'async');
    const values = within(drillSelect()).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['move-in-loop', ...allDrills.filter((d) => d.track === 'async').map((d) => d.id)]);
  });

  test('the mobile select navigates to the chosen drill', async () => {
    const user = userEvent.setup();
    render(<DrillsPage />);
    const drill = drillById.get('own-e0502')!;
    expect(within(drillSelect()).getByRole('option', { name: `${drill.errorCode} ${drill.title}` })).toBeInTheDocument();
    await user.selectOptions(drillSelect(), 'own-e0502');
    expect(window.location.hash).toBe('#/drills/own-e0502');
  });

  test('next drill goes to the following drill after answering', async () => {
    const user = userEvent.setup();
    render(<DrillsPage drillId={allDrills[0].id} />);
    await answer(user);
    await user.click(screen.getByRole('button', { name: 'Next drill' }));
    expect(window.location.hash).toBe(`#/drills/${allDrills[1].id}`);
    expect(screen.getByText(/you have tried 1, and/)).toBeInTheDocument();
  });

  test('next drill wraps around from the last drill to the first', async () => {
    const user = userEvent.setup();
    render(<DrillsPage drillId={allDrills.at(-1)!.id} />);
    await answer(user);
    await user.click(screen.getByRole('button', { name: 'Next drill' }));
    expect(window.location.hash).toBe(`#/drills/${allDrills[0].id}`);
  });

  test('next drill stays within the filtered drills', async () => {
    const user = userEvent.setup();
    const asyncDrills = allDrills.filter((d) => d.track === 'async');
    render(<DrillsPage drillId={asyncDrills.at(-1)!.id} />);
    await user.selectOptions(trackSelect(), 'async');
    await answer(user);
    await user.click(screen.getByRole('button', { name: 'Next drill' }));
    expect(window.location.hash).toBe(`#/drills/${asyncDrills[0].id}`);
  });

  test('next drill uses every drill when the filter is empty', async () => {
    const user = userEvent.setup();
    expect(allDrills[2].track).not.toBe('async');
    render(<DrillsPage drillId={allDrills[2].id} />);
    // No async drill is solved, and answering this ownership drill cannot change that.
    await user.selectOptions(trackSelect(), 'async');
    await user.click(screen.getByRole('radio', { name: 'Solved' }));
    await answer(user);
    expect(screen.getByText('Nothing matches this filter.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next drill' }));
    expect(window.location.hash).toBe(`#/drills/${allDrills[3].id}`);
  });
});
