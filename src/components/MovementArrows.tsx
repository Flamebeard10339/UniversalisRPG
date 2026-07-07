import { getAvailableTravelEdgesForNode, getLocationInDirection, type CardinalDirection } from '../game/travel';
import type { ActionResolutionContext, ContentBundle, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';

type MovementArrowsProps = {
  bundle: ContentBundle;
  context: ActionResolutionContext;
  playState: UniversePlayState;
  onMove: (locationId: string) => void;
  t: Translator;
};

// Arranged to match the 3x3 grid visually: row-major, center is the player's
// current tile and is never a button.
const grid: Array<CardinalDirection | null> = ['nw', 'n', 'ne', 'w', null, 'e', 'sw', 's', 'se'];

const arrowGlyph: Record<CardinalDirection, string> = {
  n: '↑',
  s: '↓',
  e: '→',
  w: '←',
  ne: '↗',
  nw: '↖',
  se: '↘',
  sw: '↙',
};

export const MovementArrows = ({ bundle, context, playState, onMove, t }: MovementArrowsProps) => {
  const disabled = Boolean(playState.activeTravel);
  // Geometric adjacency isn't enough on its own: a wall (highly-connected
  // mode) or the absence of an authored edge (sparse mode) can make an
  // adjacent tile untraversable, so only enable a direction that the travel
  // engine actually considers reachable right now.
  const reachableIds = new Set(
    getAvailableTravelEdgesForNode(playState, context, playState.currentLocationId).map((edge) => edge.target),
  );

  return (
    <section className="grid gap-2 rounded border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-base font-semibold text-slate-100">{t('movementArrows.title', 'Move')}</h2>
      <div className="grid w-fit grid-cols-3 gap-2">
        {grid.map((direction, index) => {
          if (!direction) {
            return <div className="h-12 w-12" key={`center-${index}`} />;
          }

          const target = getLocationInDirection(bundle, playState.currentLocationId, direction);
          const reachable = Boolean(target && reachableIds.has(target.id));

          return (
            <button
              aria-label={t(`movementArrows.direction.${direction}`, direction)}
              className="grid h-12 w-12 place-items-center rounded border border-slate-700 bg-slate-950 text-xl text-cyan-100 transition hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-30"
              data-direction={direction}
              disabled={!reachable || disabled}
              key={direction}
              onClick={() => target && onMove(target.id)}
              type="button"
            >
              {arrowGlyph[direction]}
            </button>
          );
        })}
      </div>
    </section>
  );
};
