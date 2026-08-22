import { RuntimeError } from './error';
import { Action } from '../grammar/action';
import { actionAddress, ActionDeclaration } from '../content/sections/action';
import { declaredId, Entity } from '../content/sections/entity';
import { Location } from '../content/sections/location';
import { humanizeEn } from '../grammar/values';
import { mapOf, Registry } from '../content/registry';
import { isActionOwnerKind, registryMapOf } from '../content/sections';
import { BASE_LANGUAGE, localizerFor, type Localized, type Localizer } from './localized';
import { travelSecondsPerUnit } from './tuning';
import { PLAYER, type Seat, templateOf } from './state';

export function actorEntity(registry: Registry, actorId: string): Entity | undefined {
  return actorId === PLAYER ? registry.player : registry.entities.get(templateOf(actorId));
}

// A section kind that nests actions answers from its own map; the rest are
// sources of an action that no section declares.
export function findActionOwner(obj: string, objId: string, registry: Registry): unknown {
  if (isActionOwnerKind(obj)) return mapOf(registry, registryMapOf(obj)!).get(objId);
  switch (obj) {
    case 'action': {
      const declared = registry.actions.get(objId);
      return declared ? { actions: [declared] } : undefined;
    }
    case 'recipe': {
      const action = registry.recipeActions.get(objId);
      return action ? { actions: [action] } : undefined;
    }
    case 'travel': {
      const [origin, dest] = objId.split(TRAVEL_PAIR);
      return { actions: [travelAction(origin, dest, registry)] };
    }
    default:
      return undefined;
  }
}

function locationDistance(a: Location, b: Location): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export const TRAVEL_PAIR = '>';

export const travelPair = (origin: string, dest: string): string => `${origin}${TRAVEL_PAIR}${dest}`;

export const TRAVEL_ADDRESS = 'travel';

export function travelEndProblem(localizer: Localizer, originId: string, destId: string, registry: Registry): Localized | null {
  if (!registry.locations.has(originId)) return localizer.engine('engine.travel.unknown-origin', { location: localizer.identifier(originId) });
  if (!registry.locations.has(destId)) return localizer.engine('engine.travel.unknown-destination', { location: localizer.identifier(destId) });
  return null;
}

export function travelAction(originId: string, destId: string, registry: Registry): ActionDeclaration {
  const problem = travelEndProblem(localizerFor(registry, BASE_LANGUAGE), originId, destId, registry);
  if (problem) throw new RuntimeError(problem);
  return {
    id: TRAVEL_ADDRESS,
    label: humanizeEn(TRAVEL_ADDRESS),
    generatedLabel: true,
    results: [{ kind: 'relocate', location: destId }],
    time: locationDistance(registry.locations.get(originId)!, registry.locations.get(destId)!) * travelSecondsPerUnit(registry),
  };
}

export function seatedAction(seat: Seat, registry: Registry, actorId: string): Action | undefined {
  const dot = seat.ownerRef.indexOf('.');
  const obj = seat.ownerRef.slice(0, dot);
  const objId = seat.ownerRef.slice(dot + 1);
  if (obj === 'action') {
    const own = actorEntity(registry, actorId)?.actions.find((each) => declaredId(each) === objId);
    if (own) return own;
  }
  const owner = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  return owner?.actions?.find((each) => actionAddress(each) === seat.actionSlug);
}
