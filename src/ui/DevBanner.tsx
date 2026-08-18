import { DevOnly } from './DevOnly';
import type { Words } from './words';

// Whose session this is, said where somebody standing on any page can read it.
// Above the column rather than on a page, for the same reason the fault banner
// is: it is true of the whole session and of no screen in particular.
//
// It is a reading of the one answer and not a second one — it goes through the
// same gate every dev-only surface goes through, so a strip saying this is a
// developer's session while the editing surfaces are hidden is a state that
// cannot be built (c6).
export function DevBanner({ dev, words }: { dev: boolean; words: Words }): JSX.Element {
  return (
    <DevOnly dev={dev}>
      <p role="status" className="shrink-0 bg-accent px-3 py-1 text-center text-xs font-semibold uppercase tracking-wide text-accent-text">
        {words('dev')}
      </p>
    </DevOnly>
  );
}
