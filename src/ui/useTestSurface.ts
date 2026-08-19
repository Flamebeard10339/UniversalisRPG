import { useEffect, useRef } from 'react';
import type { AgentSurfaces } from './agent/surfaces';

// The registration point, gated on the constant a production build folds to
// false. The harness and the builders both arrive by imports inside the dead
// branch, which is the same shape the entry point installs the harness with,
// so a build that drops the branch drops every module reachable only from it.
// A caller hands over the values it already holds and never the surface built
// from them: a call site that named a builder would keep the builder reachable
// however the branch folds.
export function useTestSurface<Name extends keyof AgentSurfaces>(name: Name, held: AgentSurfaces[Name]): void {
  // Re-read on every call rather than captured once: what a component hands
  // over belongs to the render it handed it over in, and an agent calling an
  // action a minute later must move the component as it stands now.
  const latest = useRef(held);
  latest.current = held;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let drop: (() => void) | null = null;
    let dropped = false;
    void Promise.all([import('./agent/testHarness'), import('./agent/surfaces')]).then(([{ registerTestSurface }, { SURFACE_BUILDERS }]) => {
      if (!dropped) drop = registerTestSurface(name, () => SURFACE_BUILDERS[name](latest.current));
    });
    return () => {
      dropped = true;
      drop?.();
    };
  }, [name]);
}
