// The CLI entry points only hand process.argv to `main` and exit with its code.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const checkContent = vi.hoisted(() => ({ main: vi.fn(), nodeDeps: vi.fn(() => ({ fake: 'deps' })) }));
const pasteOutput = vi.hoisted(() => ({ main: vi.fn(), nodePasteDeps: vi.fn(() => ({ fake: 'paste deps' })) }));

vi.mock('../../scripts/lib/checkContent.ts', () => checkContent);
vi.mock('../../scripts/lib/pasteOutput.ts', () => pasteOutput);

const argv = process.argv;

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
});

afterEach(() => {
  process.argv = argv;
});

describe('scripts/check-content.ts', () => {
  test('passes the CLI arguments and real dependencies to main', async () => {
    checkContent.main.mockResolvedValue(0);
    process.argv = ['node', 'scripts/check-content.ts', '--no-rustc', '--only', 'drill/'];
    await import('../../scripts/check-content.ts');
    expect(checkContent.main).toHaveBeenCalledWith(['--no-rustc', '--only', 'drill/'], { fake: 'deps' });
    expect(process.exit).not.toHaveBeenCalled();
  });

  test('exits with the code main returns when the check fails', async () => {
    checkContent.main.mockResolvedValue(1);
    process.argv = ['node', 'scripts/check-content.ts'];
    await import('../../scripts/check-content.ts');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});

describe('scripts/paste-output.ts', () => {
  test('passes the unit id and real dependencies to main', async () => {
    pasteOutput.main.mockReturnValue(0);
    process.argv = ['node', 'scripts/paste-output.ts', 'drill/move-in-loop'];
    await import('../../scripts/paste-output.ts');
    expect(pasteOutput.main).toHaveBeenCalledWith(['drill/move-in-loop'], { fake: 'paste deps' });
    expect(process.exit).not.toHaveBeenCalled();
  });

  test('exits with the code main returns on failure', async () => {
    pasteOutput.main.mockReturnValue(1);
    process.argv = ['node', 'scripts/paste-output.ts'];
    await import('../../scripts/paste-output.ts');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
