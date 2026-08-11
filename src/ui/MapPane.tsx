import type { PlayView } from '../runtime/session';
import { mapRows, type Place } from './discovery';

// A place and the discovered places it joins to, which is the whole of what the
// engine publishes about the shape of the world. Drawn as a list rather than as
// a graph: a graph library was removed from this repo as unimported (UI-M3) and
// nothing here needs one to answer "where can I get to from there".
function Row({ place, here, flash, connections }: { place: Place; here: boolean; flash: boolean; connections: string[] }): JSX.Element {
  return (
    <li className={`${flash ? 'arrived' : ''} rounded-lg border px-3 py-2 ${here ? 'border-accent bg-panel' : 'border-border'}`}>
      <p className={`truncate text-sm ${here ? 'font-semibold text-accent' : 'font-medium'}`}>{place.title}</p>
      {connections.length > 0 ? <p className="mt-0.5 text-xs text-text-subtle">{connections.join(' · ')}</p> : null}
    </li>
  );
}

export function MapPane({ view, arrivals, generation }: { view: PlayView | null; arrivals: readonly string[]; generation: number }): JSX.Element {
  const discovered = view?.discovered ?? [];
  const titles: Record<string, string> = Object.fromEntries(discovered.map((place) => [place.id, place.title]));
  const rows = mapRows(discovered, view?.location.id ?? '');

  return (
    <div className="unbarred min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <ul className="mx-auto flex max-w-2xl flex-col gap-2">
        {rows.map((row) => (
          <Row
            key={`${row.place.id}-${arrivals.includes(row.place.id) ? generation : 0}`}
            place={row.place}
            here={row.here}
            flash={arrivals.includes(row.place.id)}
            connections={row.place.adjacent.map((id) => titles[id] ?? id)}
          />
        ))}
      </ul>
    </div>
  );
}
