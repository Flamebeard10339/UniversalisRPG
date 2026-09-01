import { mapOf, type Registry } from '../content/registry';
import { registryMapOf } from '../content/sections';
import { groupOf, standingGroup, type Group } from '../content/sections/group';
import type { QuestStanding } from '../content/sections/quest';
import { ownerRef } from './state';
import type { Answer, Localized, Localizer } from './localized';

export interface GroupRow {
  readonly id: Answer;
  readonly title: Localized;
  readonly colour: string;
}

const row = (localizer: Localizer, found: Group | undefined): GroupRow | undefined =>
  found === undefined ? undefined : { id: found.id as Answer, title: localizer.title('group', found.id), colour: found.colour };

export function grouping(registry: Registry, localizer: Localizer, kind: string, id: string): { group?: GroupRow } {
  const name = registryMapOf(kind);
  const held = name === null ? undefined : (mapOf(registry, name).get(id) as { group?: string } | undefined);
  const found = row(localizer, groupOf(registry.groups, kind, held?.group));
  return found === undefined ? {} : { group: found };
}

export const groupNamed = (registry: Registry, localizer: Localizer, id: string): GroupRow | undefined => row(localizer, registry.groups.get(id));

export const groupStandingFor = (registry: Registry, localizer: Localizer, standing: QuestStanding): GroupRow | undefined => row(localizer, standingGroup(registry.groups, standing));

export const grouped = (localizer: Localizer, group: GroupRow | undefined, said: Localized): Localized =>
  group === undefined ? said : localizer.engine('engine.repl.grouped', { group: group.title, said });

export const offeredBy = (registry: Registry, localizer: Localizer, kind: string, id: string, masked = false): { of: Answer; detail: Localized; group?: GroupRow } => ({
  of: ownerRef(kind, id),
  detail: masked ? localizer.engine('engine.entity.unexamined') : localizer.title(kind, id),
  ...grouping(registry, localizer, kind, id),
});
