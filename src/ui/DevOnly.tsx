import type { ReactNode } from 'react';

// A surface only a developer's session may reach. The mark and the gate are one
// statement rather than two that have to agree: there is no way to write the
// mark on something that is drawn while the session is the player's, so "every
// dev-only surface is gated" holds by construction and the check is only that
// nothing else in the tree writes the mark (c6).
//
// `contents` rather than a box: what is inside lays out as though this were not
// here, so marking a surface never moves it.
export function DevOnly({ dev, children }: { dev: boolean; children: ReactNode }): JSX.Element | null {
  return dev ? (
    <div data-dev="yes" className="contents">
      {children}
    </div>
  ) : null;
}
