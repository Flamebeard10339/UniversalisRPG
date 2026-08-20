// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { createTransientChannel, TransientProvider, useMoment } from './transient';

function mounted(element: JSX.Element): () => void {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  return () => {
    act(() => root.unmount());
    host.remove();
  };
}

describe('the suite runs a React effect', () => {
  it('runs an effect declared by a src/ui hook, and the effect reaches the channel', () => {
    const channel = createTransientChannel();
    function Host(): JSX.Element {
      return <span>{useMoment('note', true, 'a-subject')}</span>;
    }

    expect(channel.notes()).toHaveLength(0);
    const unmount = mounted(
      <TransientProvider value={channel}>
        <Host />
      </TransientProvider>,
    );
    expect(channel.notes().length).toBeGreaterThan(0);
    unmount();
  });

  it('does not reach the channel when the moment does not play', () => {
    const channel = createTransientChannel();
    function Host(): JSX.Element {
      return <span>{useMoment('note', false, 'a-subject')}</span>;
    }
    const unmount = mounted(
      <TransientProvider value={channel}>
        <Host />
      </TransientProvider>,
    );
    expect(channel.notes()).toHaveLength(0);
    unmount();
  });
});

const EXERCISED: readonly string[] = ['transient.ts'];

const NOT_EXERCISED: readonly string[] = ['useTestSurface.ts', 'App.tsx', 'DragSheet.tsx', 'EditPane.tsx', 'Home.tsx', 'MapPane.tsx', 'Pager.tsx', 'PlaneModal.tsx', 'VStack.tsx'];

describe('what the layer still does not run', () => {
  const here = path.join(process.cwd(), 'src', 'ui');
  const declaring = readdirSync(here)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.[jt]sx?$/.test(name))
    .filter((name) => /\buse(?:Layout)?Effect\s*\(/.test(readFileSync(path.join(here, name), 'utf8')));

  it('the walk had subjects', () => {
    expect(declaring.length).toBeGreaterThan(3);
  });

  it('every module declaring an effect is classified', () => {
    const classified = new Set([...EXERCISED, ...NOT_EXERCISED]);
    expect(declaring.filter((name) => !classified.has(name))).toEqual([]);
  });

  it('neither list names a module that has stopped declaring an effect', () => {
    expect([...EXERCISED, ...NOT_EXERCISED].filter((name) => !declaring.includes(name))).toEqual([]);
  });

  it('reports how many modules under src/ui have effects no test runs', () => {
    const uncovered = declaring.filter((name) => !EXERCISED.includes(name));
    console.log(`src/ui modules declaring an effect that no mounting test drives: ${uncovered.length} of ${declaring.length} — ${uncovered.join(', ')}`);
    expect(uncovered.length).toBeLessThanOrEqual(NOT_EXERCISED.length);
  });
});
