// Every real project has crates, stretch goals and hints, and only exercises
// real tracks. These mocked projects cover the bare-bones branches.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { Project } from '../../src/content/types';
import { ProjectPage, ProjectsPage } from '../../src/pages/ProjectsPage';

vi.mock('../../src/content/projects', () => {
  const base: Project = {
    id: 'bare',
    title: 'Bare project',
    summary: 'Nothing extra.',
    dotnetEquivalent: 'Console app',
    crates: [],
    spec: ['Build it.'],
    milestones: [{ id: 'only', title: 'The only milestone', goal: ['Do it.'], hints: [], checkpoint: 'It runs.' }],
    exercises: ['ownership', 'no-such-track'],
  };
  const emptyStretch: Project = { ...base, id: 'empty-stretch', title: 'Empty stretch', stretch: [] };
  const projects = [base, emptyStretch];
  return { allProjects: projects, projectById: new Map(projects.map((p) => [p.id, p])), ecosystem: [] };
});

describe('ProjectsPage with bare-bones projects', () => {
  test('says std only for projects without crates and hides the empty ecosystem table', () => {
    render(<ProjectsPage />);
    expect(screen.getByRole('link', { name: /Bare project/ })).toHaveTextContent('std only');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'The ecosystem, mapped' })).not.toBeInTheDocument();
  });
});

describe('ProjectPage with a bare-bones project', () => {
  test('skips unknown tracks, crates, hints and stretch goals', () => {
    render(<ProjectPage projectId="bare" />);
    const exercises = screen.getByText(/^Exercises:/);
    expect(exercises).toHaveTextContent(/^Exercises: Ownership, moves, borrows$/);
    expect(within(exercises).getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Crates' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hint/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'If you want more' })).not.toBeInTheDocument();
  });

  test('hides stretch goals when the list is empty', () => {
    render(<ProjectPage projectId="empty-stretch" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Empty stretch' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'If you want more' })).not.toBeInTheDocument();
  });
});
