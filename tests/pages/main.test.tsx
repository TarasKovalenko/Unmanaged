import { screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

describe('main', () => {
  test('mounts the app into #root', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    await import('../../src/main.tsx');

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('&unmanaged');
    expect(root).toContainElement(heading);
  });
});
