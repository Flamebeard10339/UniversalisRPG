import { RuntimeError } from './error';
import { Action } from '../grammar/action';
import { actionAddress, ActionDeclaration } from '../content/sections/action';
import { declaredId, Entity } from '../content/sections/entity';
import { mapOf, Registry } from '../content/registry';
import { isActionOwnerKind, registryMapOf } from '../content/sections';
import { BASE_LANGUAGE, localizerFor, type Localized, type Localizer } from './localized';
import { travelSeconds } from './tuning';
import { parseOwnerRef, PLAYER, type Seat, templateOf } from './state';

export function actorEntity(registry: Registry, actorId: string): Entity | undefined {
  return actorId === PLAYER ? registry.player : registry.entities.get(templateOf(actorId));
}

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
    label: TRAVEL_ADDRESS,
    generatedLabel: true,
    results: [{ kind: 'relocate', location: destId }],
    time: travelSeconds(registry),
  };
}

export function seatedAction(seat: Seat, registry: Registry, actorId: string): Action | undefined {
  const { obj, objId } = parseOwnerRef(seat.ownerRef);
  if (obj === 'action') {
    const own = actorEntity(registry, actorId)?.actions.find((each) => declaredId(each) === objId);
    if (own) return own;
  }
  const owner = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  return owner?.actions?.find((each) => actionAddress(each) === seat.actionSlug);
}
