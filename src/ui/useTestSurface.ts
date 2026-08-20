import { useEffect, useRef } from 'react';
import type { AgentSurfaces } from './agent/surfaces';

export function useTestSurface<Name extends keyof AgentSurfaces>(name: Name, held: AgentSurfaces[Name]): void {
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
