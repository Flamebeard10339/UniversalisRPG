import { mapOf, type Registry } from '../content/registry';
import { registryMapOf } from '../content/sections';
import { groupOf, standingGroup, type Group } from '../content/sections/group';
import type { QuestStanding } from '../content/sections/quest';
import { ownerRef } from './state';
import type { Answer, Localized, Localizer } from './localized';

// What kind of thing something is, published beside it: the word a player reads and the colour every
// surface fills with. One answer for both, so a terminal that names the group and a screen that
// paints it cannot come to disagree about what something is.
export interface GroupRow {
  readonly id: Answer;
  readonly title: Localized;
  readonly colour: string;
}

const row = (localizer: Localizer, found: Group | undefined): GroupRow | undefined =>
  found === undefined ? undefined : { id: found.id as Answer, title: localizer.title('group', found.id), colour: found.colour };

// The group whatever is held under that id belongs to, read off the section itself rather than asked
// of each caller, so a kind that gains a `group:` is published the same way with nothing edited here.
// A world that declares no group for the kind publishes no field rather than an empty one.
export function grouping(registry: Registry, localizer: Localizer, kind: string, id: string): { group?: GroupRow } {
  const name = registryMapOf(kind);
  const held = name === null ? undefined : (mapOf(registry, name).get(id) as { group?: string } | undefined);
  const found = row(localizer, groupOf(registry.groups, kind, held?.group));
  return found === undefined ? {} : { group: found };
}

// The group a world declares under a name, for what is a kind of thing without being a kind of
// section — where a quest stands is one such, and is coloured and named off a `# group` like the
// rest rather than out of whatever draws it.
export const groupNamed = (registry: Registry, localizer: Localizer, id: string): GroupRow | undefined => row(localizer, registry.groups.get(id));

// The group a world says means this standing of a quest. The engine names no group of its own for
// them: a world declares which of its own each standing is, with `stands for:` on the group.
export const groupStandingFor = (registry: Registry, localizer: Localizer, standing: QuestStanding): GroupRow | undefined => row(localizer, standingGroup(registry.groups, standing));

// A colour is not a word, so a driver that cannot fill anything says the group instead. The words are
// the group's own `title:`, which is the same string a screen fills a cell for, rather than a second
// name for the same thing.
export const grouped = (localizer: Localizer, group: GroupRow | undefined, said: Localized): Localized =>
  group === undefined ? said : localizer.engine('engine.repl.grouped', { group: group.title, said });

// What a choice says about whatever offers it: the address a surface keys a cell on, the name it
// stands under and the group that colours it. Written once, so a choice minted from a new kind of
// owner carries all three or none.
//
// Masked, only the name is held back. The address still tells two things nobody has read apart, and
// the group still fills them, which is the whole of what an unread thing shows.
export const offeredBy = (registry: Registry, localizer: Localizer, kind: string, id: string, masked = false): { of: Answer; detail: Localized; group?: GroupRow } => ({
  of: ownerRef(kind, id),
  detail: masked ? localizer.engine('engine.entity.unexamined') : localizer.title(kind, id),
  ...grouping(registry, localizer, kind, id),
});
