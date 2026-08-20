import { DevOnly } from './DevOnly';
import type { Words } from './words';

export function DevBanner({ dev, words }: { dev: boolean; words: Words }): JSX.Element {
  return (
    <DevOnly dev={dev}>
      <p role="status" className="shrink-0 bg-accent px-3 py-1 text-center text-xs font-semibold uppercase tracking-wide text-accent-text">
        {words('dev')}
      </p>
    </DevOnly>
  );
}
