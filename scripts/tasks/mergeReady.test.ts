import { describe, expect, it } from 'vitest';
import { LEGS, runMergeReady, type MergeReadyDeps } from './mergeReady';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

interface Recorded {
  lines: string[];
  commands: string[];
}

function deps(overrides: Partial<MergeReadyDeps> = {}): { deps: MergeReadyDeps; recorded: Recorded } {
  const recorded: Recorded = { lines: [], commands: [] };
  return {
    recorded,
    deps: {
      run: (command) => {
        recorded.commands.push(command);
        return { status: 0 };
      },
      trackedFiles: () => ['a.ts'],
      read: () => utf8('clean'),
      emit: (line) => recorded.lines.push(line),
      ...overrides,
    },
  };
}

describe('runMergeReady', () => {
  it('runs every leg and reports success when all pass and the bytes are clean', () => {
    const { deps: d, recorded } = deps();
    expect(runMergeReady(d)).toBe(true);
    expect(recorded.commands).toEqual(LEGS.map((leg) => leg.command));
    expect(recorded.lines.at(-1)).toBe('merge-ready: every leg passed');
  });

  it('keeps running after a red leg — one answer per run, not one rerun per defect — and names what failed', () => {
    const { deps: d, recorded } = deps({
      run: (command) => {
        recorded.commands.push(command);
        return { status: command.includes('tsc') ? 2 : 0 };
      },
    });
    expect(runMergeReady(d)).toBe(false);
    expect(recorded.commands).toEqual(LEGS.map((leg) => leg.command));
    expect(recorded.lines.at(-1)).toContain('NOT merge-ready: tsc failed');
  });

  it('fails the bytes leg on a corrupt tracked file, naming it', () => {
    const { deps: d, recorded } = deps({
      trackedFiles: () => ['fine.ts', 'broken.ts'],
      read: (file) => (file === 'broken.ts' ? new Uint8Array([0]) : utf8('ok')),
    });
    expect(runMergeReady(d)).toBe(false);
    expect(recorded.lines.join('\n')).toContain('broken.ts: NUL byte at offset 0');
    expect(recorded.lines.at(-1)).toContain('bytes failed');
  });

  it('treats a null exit status as failure, not success', () => {
    const { deps: d } = deps({ run: () => ({ status: null }) });
    expect(runMergeReady(d)).toBe(false);
  });

  it('reports a tracked-file enumeration failure as a bytes-leg failure rather than a crash', () => {
    const { deps: d, recorded } = deps({
      trackedFiles: () => {
        throw new Error('git ls-files failed — cannot enumerate tracked files');
      },
    });
    expect(runMergeReady(d)).toBe(false);
    expect(recorded.lines.join('\n')).toContain('git ls-files failed');
  });
});
