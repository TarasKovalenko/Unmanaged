// Real content always has drills; the empty state needs a mocked drills module.
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { DrillsPage } from '../../src/pages/DrillsPage';

vi.mock('../../src/content/drills', () => ({ allDrills: [], drillById: new Map() }));

describe('DrillsPage with no drills', () => {
  test('says no drills have been written', () => {
    render(<DrillsPage drillId="anything" />);
    expect(screen.getByText('No drills have been written yet.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Error drills' })).not.toBeInTheDocument();
  });
});
