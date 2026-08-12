import type { PlayView } from '../runtime/session';
import { Meter } from './Meter';

// The boundary between the play surface and the character sheet: what the
// player is carrying through the world, read downward from Home and upward from
// the sheet. The meters sit here rather than under the location because a
// resource is a fact about the character, and because Home's scarcest room is
// the vertical kind and this strip is already being paid for.
export function StatusBanner({ view }: { view: PlayView | null }): JSX.Element {
  return (
    <div className="flex min-h-[48px] flex-col justify-center gap-1.5 border-y border-border bg-surface px-4 py-2">
      {(view?.resources ?? []).map((resource) => (
        <Meter key={resource.id} title={resource.title} current={resource.current} max={resource.max} readout={resource.display === 'full'} />
      ))}
    </div>
  );
}
