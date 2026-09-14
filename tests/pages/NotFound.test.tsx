import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { NotFound } from '../../src/pages/NotFound';

describe('NotFound', () => {
  test('shows a compiler-style error and a link back to the start', () => {
    render(<NotFound />);
    expect(screen.getByText('error[E0425]: cannot find page in this scope')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the start' })).toHaveAttribute('href', '#/');
  });
});
