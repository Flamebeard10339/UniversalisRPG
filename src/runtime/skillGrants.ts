import { ActionResult } from '../grammar/actionResult';
import { Entity } from '../content/entity';
import { grantValue, SkillGrant } from '../grammar/skillGrant';
import { point } from '../grammar/range';
import { Registry } from '../content/registry';

interface EventGrant {
  skill: string;
  grant: SkillGrant;
}

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

export function experienceFor(registry: Registry, earner: Entity | undefined, eventId: string, amount: number): ActionResult[] {
  const grants = grantsByEvent(registry).get(eventId);
  if (grants === undefined || earner === undefined) return [];
  const earned: ActionResult[] = [];
  for (const { skill, grant } of grants) {
    const gained = Math.round(grantValue(grant, amount));
    if (gained > 0 && earner.skills.includes(skill)) earned.push({ kind: 'xp', skill, amount: point(gained) });
  }
  return earned;
}
