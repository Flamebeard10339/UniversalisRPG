import { useEffect, useRef } from 'react';

export type TestAction = (value: unknown) => void | Promise<void>;

// What one component offers a driving agent: the actions only it can perform,
// and the part of the shell's state only it holds. A component that owns
// neither offers neither, and the surface it never builds is one no agent can
// call.
export interface TestSurface {
  actions?: Readonly<Record<string, TestAction>>;
  state?: () => unknown;
}

// The registration point, gated on the constant a production build folds to
// false. The harness itself arrives by an import inside the dead branch, which
// is the same shape the session container installs it with, so a build that
// drops the branch drops every module reachable only from it.
export function useTestSurface(name: string, surface: TestSurface): void {
  // Re-read on every call rather than captured once: the actions close over the
  // render they were built in, and an agent calling one a minute later must
  // move the component as it stands now.
  const latest = useRef(surface);
  latest.current = surface;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let drop: (() => void) | null = null;
    let dropped = false;
    void import('./testHarness').then(({ registerTestSurface }) => {
      if (!dropped) drop = registerTestSurface(name, () => latest.current);
    });
    return () => {
      dropped = true;
      drop?.();
    };
  }, [name]);
}
