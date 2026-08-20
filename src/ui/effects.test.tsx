// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { createTransientChannel, TransientProvider, useMoment } from './transient';

// Every other test under this directory renders through `renderToStaticMarkup`,
// which never runs an effect. Four survived the whole suite at zero failures on
// the branch that noticed, two of them the write half of the clause being
// graded. This file is the environment that runs one, and the census that says
// how much of the layer still is not run.

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
  // `useMoment` is chosen over a probe component written here because a probe
  // proves the environment and nothing about the layer: its effect is the one
  // door onto the transient channel, so a moment reaching the channel is real
  // `src/ui` code having run after a real mount.
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
    // Nothing but the effect can have put this here: `useMoment` returns the
    // class name synchronously and plays into the channel only from its effect.
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

// The modules whose effects a mounting test actually drives. Derived against
// the tree below rather than trusted: a module that starts declaring an effect
// and is named in neither list fails this file, which is what stops the
// untested set being a sentence in a commit message that was born short by two.
const EXERCISED: readonly string[] = ['transient.ts'];

const NOT_EXERCISED: readonly string[] = ['useTestSurface.ts', 'App.tsx', 'DragSheet.tsx', 'EditPane.tsx', 'Home.tsx', 'MapPane.tsx', 'Pager.tsx', 'PlaneModal.tsx', 'VStack.tsx'];

describe('what the layer still does not run', () => {
  const here = path.join(process.cwd(), 'src', 'ui');
  const declaring = readdirSync(here)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.[jt]sx?$/.test(name))
    // `useLayoutEffect` included: it is the same reach into the DOM after a
    // render, and the statement this file replaced counted both.
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
    // Not an assertion about the number, which is work rather than a rule. The
    // number is printed so that it is read, and so that driving one moves it.
    const uncovered = declaring.filter((name) => !EXERCISED.includes(name));
    console.log(`src/ui modules declaring an effect that no mounting test drives: ${uncovered.length} of ${declaring.length} — ${uncovered.join(', ')}`);
    expect(uncovered.length).toBeLessThanOrEqual(NOT_EXERCISED.length);
  });
});
