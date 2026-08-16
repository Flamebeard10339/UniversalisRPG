import { ActionResult } from '../grammar/actionResult';
import { Entity } from '../content/entity';
import { grantValue, SkillGrant } from '../grammar/skillGrant';
import { point } from '../grammar/range';
import { Registry } from '../content/registry';

interface EventGrant {
  skill: string;
  grant: SkillGrant;
}

// Derived from the registry the first time one is asked for and held against
// it, because a registry does not change after it is built: a moment nobody
// wrote a grant for then costs one map lookup rather than a walk over every
// skill declared.
const byRegistry = new WeakMap<Registry, Map<string, EventGrant[]>>();

function grantsByEvent(registry: Registry): Map<string, EventGrant[]> {
  const held = byRegistry.get(registry);
  if (held) return held;
  const built = new Map<string, EventGrant[]>();
  for (const skill of registry.skills.values()) {
    for (const grant of skill.grants) {
      const sofar = built.get(grant.event);
      if (sofar) sofar.push({ skill: skill.id, grant });
      else built.set(grant.event, [{ skill: skill.id, grant }]);
    }
  }
  byRegistry.set(registry, built);
  return built;
}

// What an event is worth to whoever it happened to, as ordinary `xp:` results,
// so that a grant is a second source of experience and never a second store of
// it. A skill the earner does not carry trains nobody, which is what an
// entity's `skills:` says and the only thing that decides who earns.
export function experienceFor(registry: Registry, earner: Entity | undefined, eventId: string, amount: number): ActionResult[] {
  const grants = grantsByEvent(registry).get(eventId);
  if (grants === undefined || earner === undefined) return [];
  const earned: ActionResult[] = [];
  for (const { skill, grant } of grants) {
    // Whole, because a level is decided by integer comparison and a fractional
    // total would put a threshold on the wrong side of a float.
    const gained = Math.round(grantValue(grant, amount));
    if (gained > 0 && earner.skills.includes(skill)) earned.push({ kind: 'xp', skill, amount: point(gained) });
  }
  return earned;
}
