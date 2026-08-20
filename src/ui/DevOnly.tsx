import type { ReactNode } from 'react';

export function DevOnly({ dev, children }: { dev: boolean; children: ReactNode }): JSX.Element | null {
  return dev ? (
    <div data-dev="yes" className="contents">
      {children}
    </div>
  ) : null;
}
