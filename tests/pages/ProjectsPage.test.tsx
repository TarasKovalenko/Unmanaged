import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { allProjects, ecosystem, projectById } from '../../src/content/projects';
import { tracks } from '../../src/content/tracks';
import { ProjectPage, ProjectsPage } from '../../src/pages/ProjectsPage';
import { seedStorage, storedState } from './helpers';

beforeEach(() => seedStorage({}));

const todo = projectById.get('proj-cli-todo')!;
const sidebar = () => within(screen.getByRole('navigation', { name: 'Milestones' }));
const milestone = (id: string) => within(document.getElementById(`m-${id}`)!);

describe('ProjectsPage', () => {
  test('lists every project with its crates and milestone progress', () => {
    seedStorage({ milestones: [`${todo.id}/${todo.milestones[0].id}`, `${todo.id}/${todo.milestones[1].id}`, 'other/x'] });
    render(<ProjectsPage />);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(allProjects.map((p) => `#/projects/${p.id}`));

    const todoLink = screen.getByRole('link', { name: new RegExp(todo.title) });
    expect(todoLink).toHaveTextContent(`In .NET: ${todo.dotnetEquivalent}`);
    expect(todoLink).toHaveTextContent(todo.crates.map((c) => c.name).join(', '));
    expect(todoLink).toHaveTextContent(`2/${todo.milestones.length} milestones done`);

    const other = allProjects[1];
    expect(screen.getByRole('link', { name: new RegExp(other.title) })).toHaveTextContent(`0/${other.milestones.length} milestones done`);
  });

  test('maps the .NET ecosystem to Rust in a table', () => {
    render(<ProjectsPage />);
    const table = within(screen.getByRole('table'));
    expect(table.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['.NET', 'Rust', 'Notes']);
    expect(table.getAllByRole('row')).toHaveLength(ecosystem.length + 1);
    expect(table.getByRole('cell', { name: ecosystem[0].dotnet })).toBeInTheDocument();
  });
});

describe('ProjectPage', () => {
  test('shows not-found for an unknown project', () => {
    render(<ProjectPage projectId="nope" />);
    expect(screen.getByText(/cannot find page in this scope/)).toBeInTheDocument();
  });

  test('shows the header, exercised tracks, crates and stretch goals', () => {
    render(<ProjectPage projectId={todo.id} />);
    expect(screen.getByRole('heading', { level: 1, name: todo.title })).toBeInTheDocument();
    expect(screen.getByText(`In .NET: ${todo.dotnetEquivalent}`)).toBeInTheDocument();

    const exercises = screen.getByText(/^Exercises:/);
    const titles = todo.exercises.map((id) => tracks.find((t) => t.id === id)!.title);
    expect(exercises).toHaveTextContent(`Exercises: ${titles.join(', ')}`);
    expect(within(exercises).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(todo.exercises.map((id) => `#/tracks/${id}`));

    const crates = within(screen.getByRole('region', { name: 'Crates' }));
    expect(crates.getAllByRole('listitem')).toHaveLength(todo.crates.length);
    expect(crates.getAllByRole('listitem')[0]).toHaveTextContent(`${todo.crates[0].name} ${todo.crates[0].version}`);

    const stretch = within(screen.getByRole('region', { name: 'If you want more' }));
    expect(stretch.getAllByRole('listitem')).toHaveLength(todo.stretch!.length);
  });

  test('shows code only for milestones that have it', () => {
    const analyzer = projectById.get('proj-log-analyzer')!;
    render(<ProjectPage projectId={analyzer.id} />);
    for (const m of analyzer.milestones) {
      expect(milestone(m.id).queryAllByRole('figure')).toHaveLength(m.code ? 1 : 0);
    }
    expect(analyzer.milestones.some((m) => !m.code)).toBe(true);
  });

  test('reveals hints one at a time', async () => {
    const user = userEvent.setup();
    const m = todo.milestones[0];
    render(<ProjectPage projectId={todo.id} />);
    const item = milestone(m.id);
    expect(item.queryByText('hint 1')).not.toBeInTheDocument();

    await user.click(item.getByRole('button', { name: `Show a hint (${m.hints.length} left)` }));
    expect(item.getByText('hint 1')).toBeInTheDocument();

    for (let shown = 1; shown < m.hints.length; shown++) {
      await user.click(item.getByRole('button', { name: `Show another hint (${m.hints.length - shown} left)` }));
      expect(item.getByText(`hint ${shown + 1}`)).toBeInTheDocument();
    }
    expect(item.queryByRole('button', { name: /hint/ })).not.toBeInTheDocument();
  });

  test('ticks and unticks milestones, updating counts and storage', async () => {
    const user = userEvent.setup();
    const [first, second] = todo.milestones;
    seedStorage({ milestones: [`${todo.id}/${second.id}`] });
    render(<ProjectPage projectId={todo.id} />);
    expect(sidebar().getByText(`1 of ${todo.milestones.length} done`)).toBeInTheDocument();
    expect(milestone(second.id).getByRole('checkbox')).toBeChecked();
    expect(milestone(second.id).getByText('Done')).toBeInTheDocument();
    expect(sidebar().getByRole('link', { name: new RegExp(second.title) })).toHaveTextContent(/done$/);

    const box = milestone(first.id).getByRole('checkbox', { name: new RegExp(`for ${todo.title}, milestone 1`) });
    expect(box).not.toBeChecked();
    expect(milestone(first.id).getByText('Mark as done')).toBeInTheDocument();
    expect(sidebar().getByRole('link', { name: new RegExp(first.title) })).not.toHaveTextContent(/done$/);

    await user.click(box);
    expect(box).toBeChecked();
    expect(sidebar().getByText(`2 of ${todo.milestones.length} done`)).toBeInTheDocument();
    expect(storedState().milestones).toEqual([`${todo.id}/${second.id}`, `${todo.id}/${first.id}`]);

    await user.click(box);
    expect(box).not.toBeChecked();
    expect(storedState().milestones).toEqual([`${todo.id}/${second.id}`]);
  });

  test('sidebar links jump to their milestone without navigating', () => {
    render(<ProjectPage projectId={todo.id} />);
    expect(sidebar().getByRole('link', { name: 'All projects' })).toHaveAttribute('href', '#/projects');
    const m = todo.milestones[2];
    const target = document.getElementById(`m-${m.id}`)!;
    const scroll = vi.spyOn(target, 'scrollIntoView');
    const link = sidebar().getByRole('link', { name: new RegExp(m.title) });
    expect(fireEvent.click(link)).toBe(false);
    expect(scroll).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('');
  });
});
