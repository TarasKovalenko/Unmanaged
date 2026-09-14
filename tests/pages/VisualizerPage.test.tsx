import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { borrowSnippets, snippetById } from '../../src/content/borrow';
import { VisualizerPage } from '../../src/pages/VisualizerPage';

const snippetList = () => screen.getAllByRole('list').find((ul) => ul.querySelector('a[href^="#/visualizer/"]'))!;
const listedIds = () => within(snippetList()).getAllByRole('link').map((a) => a.getAttribute('href')!.replace('#/visualizer/', ''));
const failing = borrowSnippets.filter((s) => s.conflicts.length > 0);
const compiling = borrowSnippets.filter((s) => s.conflicts.length === 0);

describe('VisualizerPage', () => {
  test('shows the first snippet and a summary of how many compile', () => {
    render(<VisualizerPage />);
    expect(screen.getByRole('heading', { level: 2, name: borrowSnippets[0].title })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${borrowSnippets.length} snippets: ${compiling.length} compile and run, ${failing.length} do not`))).toBeInTheDocument();
    expect(listedIds()).toEqual(borrowSnippets.map((s) => s.id));
  });

  test('shows the snippet from the route and marks it current in the list', () => {
    render(<VisualizerPage snippetId="copy-types" />);
    expect(screen.getByRole('heading', { level: 2, name: snippetById.get('copy-types')!.title })).toBeInTheDocument();
    expect(within(snippetList()).getByRole('link', { current: 'page' })).toHaveAttribute('href', '#/visualizer/copy-types');
  });

  test('falls back to the first snippet for an unknown id', () => {
    render(<VisualizerPage snippetId="nope" />);
    expect(screen.getByRole('heading', { level: 2, name: borrowSnippets[0].title })).toBeInTheDocument();
  });

  test('labels list entries by outcome: compiles, compile error, runtime panic', () => {
    render(<VisualizerPage />);
    const list = within(snippetList());
    const ok = list.getByRole('link', { name: /Copy types copy, everything else moves/ });
    expect(ok).toHaveTextContent('✓');
    expect(ok).toHaveTextContent('(compiles)');

    const error = list.getByRole('link', { name: /Assignment moves a String/ });
    expect(error).toHaveTextContent('✕');
    expect(error).toHaveTextContent('E0382');
    expect(error).toHaveTextContent('(does not compile)');

    const panic = list.getByRole('link', { name: /The same rule, checked at runtime/ });
    expect(panic).toHaveTextContent('!');
    expect(panic).toHaveTextContent('panic');
  });

  test('filters to snippets that compile, then to those with errors, then back to all', async () => {
    const user = userEvent.setup();
    render(<VisualizerPage />);
    const group = within(screen.getByRole('radiogroup', { name: 'Filter snippets' }));

    await user.click(group.getByRole('radio', { name: 'Compiles' }));
    expect(group.getByRole('radio', { name: 'Compiles' })).toHaveAttribute('aria-checked', 'true');
    expect(listedIds()).toEqual(compiling.map((s) => s.id));

    await user.click(group.getByRole('radio', { name: 'Errors' }));
    expect(listedIds()).toEqual(failing.map((s) => s.id));

    await user.click(group.getByRole('radio', { name: 'All' }));
    expect(listedIds()).toEqual(borrowSnippets.map((s) => s.id));
  });

  test('the mobile select labels snippets and navigates to the chosen one', async () => {
    const user = userEvent.setup();
    render(<VisualizerPage />);
    const select = screen.getByRole('combobox', { name: 'Snippet' });
    expect(select).toHaveValue(borrowSnippets[0].id);
    expect(within(select).getByRole('option', { name: '✓ Copy types copy, everything else moves' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: '✕ Assignment moves a String (E0382)' })).toBeInTheDocument();

    await user.selectOptions(select, 'copy-types');
    expect(window.location.hash).toBe('#/visualizer/copy-types');
  });
});
