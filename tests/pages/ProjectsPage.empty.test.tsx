// Real content has projects; the empty state needs a mocked projects module.
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ProjectsPage } from '../../src/pages/ProjectsPage';

vi.mock('../../src/content/projects', () => ({ allProjects: [], projectById: new Map(), ecosystem: [] }));

describe('ProjectsPage with no projects', () => {
  test('says projects are being written', () => {
    render(<ProjectsPage />);
    expect(screen.getByText('Projects are being written.')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
