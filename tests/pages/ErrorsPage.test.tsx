import { render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { errorCodes } from '../../src/content/errors';
import { buildErrorIndex } from '../../src/lib/searchIndex';
import { ErrorsPage } from '../../src/pages/ErrorsPage';

// Every code used in real content has a summary. Dropping one shows how the
// page handles a code that is used but not described.
vi.mock('../../src/content/errors', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/content/errors')>();
  const { E0004: _dropped, ...rest } = real.errorCodes;
  return { errorCodes: rest };
});

const index = buildErrorIndex();
const sidebar = () => within(screen.getByRole('complementary'));
const main = () => within(screen.getByRole('complementary').nextElementSibling as HTMLElement);

describe('ErrorsPage', () => {
  test('lists every code with its title and usage count, and asks to pick one', () => {
    render(<ErrorsPage />);
    expect(screen.getByText(new RegExp(`${index.length} codes\\.`))).toBeInTheDocument();
    const links = sidebar().getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(index.map((e) => `#/errors/${e.code}`));
    const e0382 = index.find((e) => e.code === 'E0382')!;
    expect(sidebar().getByRole('link', { name: new RegExp(`^E0382`) })).toHaveTextContent(`E0382${errorCodes.E0382.title}${e0382.items.length}`);
    expect(sidebar().queryByRole('link', { current: 'page' })).not.toBeInTheDocument();

    expect(main().getByRole('heading', { level: 2, name: 'Pick a code' })).toBeInTheDocument();
    expect(main().getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(index.slice(0, 8).map((e) => `#/errors/${e.code}`));
  });

  test('uses a generic title for a code without a summary', () => {
    render(<ErrorsPage />);
    expect(sidebar().getByRole('link', { name: /^E0004/ })).toHaveTextContent('E0004Compiler error');
    expect(main().getByRole('link', { name: /^E0004/ })).toHaveTextContent('E0004Compiler error');
  });

  test('says an unknown code is not used yet', () => {
    render(<ErrorsPage code="E9999" />);
    expect(main().getByRole('heading', { level: 2, name: 'E9999 is not used on this site yet' })).toBeInTheDocument();
  });

  test('shows a known code, matched case-insensitively, with its explanation and where it appears', () => {
    render(<ErrorsPage code="e0382" />);
    const entry = index.find((e) => e.code === 'E0382')!;
    expect(sidebar().getByRole('link', { current: 'page' })).toHaveAttribute('href', '#/errors/E0382');
    expect(main().getByRole('heading', { level: 2, name: errorCodes.E0382.title })).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'rustc --explain E0382' })).toHaveAttribute('href', 'https://doc.rust-lang.org/error_codes/E0382.html');

    const items = main().getAllByRole('listitem');
    expect(items).toHaveLength(entry.items.length);
    entry.items.forEach((it, i) => {
      const link = within(items[i]).getByRole('link');
      expect(link).toHaveAttribute('href', it.to);
      expect(link).toHaveTextContent(`${{ snippet: 'visualizer', drill: 'drill', gotcha: 'gotcha' }[it.kind]}${it.title}${it.firstLine}`);
    });
    expect(entry.items.some((it) => it.firstLine)).toBe(true);
  });

  test('labels gotcha usages, which have no compiler output line', () => {
    const entry = index.find((e) => e.items.some((it) => it.kind === 'gotcha'))!;
    render(<ErrorsPage code={entry.code} />);
    const gotcha = entry.items.find((it) => it.kind === 'gotcha')!;
    const link = main().getAllByRole('link').find((a) => a.getAttribute('href') === gotcha.to)!;
    expect(link.textContent).toBe(`gotcha${gotcha.title}`);
  });

  test('a selected code without a summary has no gist', () => {
    render(<ErrorsPage code="E0004" />);
    expect(main().getByRole('heading', { level: 2, name: 'Compiler error' })).toBeInTheDocument();
    const heading = main().getByRole('heading', { level: 2 });
    expect(heading.nextElementSibling).toHaveTextContent(/^Official explanation:/);
  });

  test('a panic entry has its summary but no rustc explanation link', () => {
    render(<ErrorsPage code="panic" />);
    expect(main().getByRole('heading', { level: 2, name: errorCodes.panic.title })).toBeInTheDocument();
    expect(main().getByText(/The program compiled and then stopped/)).toBeInTheDocument();
    expect(main().queryByText(/Official explanation/)).not.toBeInTheDocument();
    expect(main().queryByRole('link', { name: /rustc --explain/ })).not.toBeInTheDocument();
  });
});
