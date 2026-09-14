import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';

import { SearchPalette } from '../../src/components/SearchPalette';
import { search } from '../../src/lib/searchIndex';

function Harness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open search
      </button>
      <SearchPalette
        open={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
      />
    </>
  );
}

async function openPalette(onClose = vi.fn()) {
  const user = userEvent.setup();
  render(<Harness onClose={onClose} />);
  await user.click(screen.getByRole('button', { name: 'open search' }));
  const dialog = screen.getByRole('dialog', { name: 'Search' });
  return { user, dialog, input: screen.getByRole('searchbox'), onClose };
}

const selected = () => screen.getAllByRole('option').findIndex((o) => o.getAttribute('aria-selected') === 'true');

describe('SearchPalette', () => {
  test('stays closed until opened, then focuses the input and shows suggestions', async () => {
    render(<Harness />);
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');
    await userEvent.click(screen.getByRole('button', { name: 'open search' }));
    const dialog = screen.getByRole('dialog', { name: 'Search' });
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByRole('searchbox')).toHaveFocus();
    expect(dialog).toHaveTextContent('Try E0382, IDisposable, RefCell or overflow.');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByRole('searchbox')).not.toHaveAttribute('aria-activedescendant');
  });

  test('typing lists matching results with their kind, first one active', async () => {
    const { user, input } = await openPalette();
    await user.type(input, 'E0382');
    const expected = search('E0382');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(expected.length);
    expect(options[0]).toHaveTextContent(expected[0].title);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', 'search-result-0');
    expect(screen.getAllByText('error code').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Try/)).not.toBeInTheDocument();
  });

  test('says when nothing matches, and Enter does nothing', async () => {
    const { user, input, onClose } = await openPalette();
    await user.type(input, 'zzqqxxnothing');
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onClose).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  test('arrow keys move the selection and stop at both ends', async () => {
    const { user, input } = await openPalette();
    await user.type(input, 'borrow');
    const count = screen.getAllByRole('option').length;
    expect(count).toBeGreaterThan(2);
    await user.keyboard('{ArrowUp}');
    expect(selected()).toBe(0);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(selected()).toBe(2);
    expect(input).toHaveAttribute('aria-activedescendant', 'search-result-2');
    for (let i = 0; i < count + 2; i++) await user.keyboard('{ArrowDown}');
    expect(selected()).toBe(count - 1);
    await user.keyboard('{ArrowUp}');
    expect(selected()).toBe(count - 2);
    // Other keys are just typing.
    await user.keyboard('s');
    expect(input).toHaveValue('borrows');
    expect(selected()).toBe(0);
  });

  test('Enter opens the active result and closes the palette', async () => {
    const { user, input, dialog, onClose } = await openPalette();
    await user.type(input, 'E0382');
    const target = search('E0382')[1];
    await user.keyboard('{ArrowDown}{Enter}');
    expect(window.location.hash).toBe(target.to);
    expect(onClose).toHaveBeenCalled();
    expect(dialog).not.toHaveAttribute('open');
  });

  test('hovering then clicking a result opens it, and the query is cleared for next time', async () => {
    const { user, input } = await openPalette();
    await user.type(input, 'RefCell');
    const options = screen.getAllByRole('option');
    await user.hover(options[1]);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await user.click(options[1]);
    expect(window.location.hash).toBe(search('RefCell')[1].to);
    await user.click(screen.getByRole('button', { name: 'open search' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  test('clicking the backdrop closes, clicking inside does not', async () => {
    const { user, dialog, input, onClose } = await openPalette();
    await user.click(input);
    expect(onClose).not.toHaveBeenCalled();
    await user.click(dialog);
    expect(onClose).toHaveBeenCalled();
    expect(dialog).not.toHaveAttribute('open');
  });

  test('Escape (the dialog close event) closes and resets', async () => {
    const { user, dialog, input, onClose } = await openPalette();
    await user.type(input, 'E0382');
    // The browser closes the dialog itself on Escape, then fires "close".
    act(() => (dialog as HTMLDialogElement).close());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('');
    expect(dialog).not.toHaveAttribute('open');
  });
});
