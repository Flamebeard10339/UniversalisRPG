import { describe, expect, it } from 'vitest';
import { loadUniverse } from '../content/load';
import { localId } from '../content/locale';
import { mapOf } from '../content/registry';
import { contentSectionMaps, isDebug, isOwnedKind } from '../content/sections';
import { sessionStatus, startSession } from './session';

const PROBED = `# info probe
version: 0.0.0

# stat max-health
base: 30

# stat attack
base: 10

# faction player

# skill digging

# slot hand
title: Hand
at: 1 1

# resource health
max: max-health

# entity player
title: You
faction: player
stats: max-health 30, attack 10
skills: digging
equipment-slots: hand

# location home
x: 0, y: 0
starting
title: Home

# item pebble
title: Pebble

# stat probe-stat
DEBUG
base: 1

# skill probe-skill
DEBUG

# race probe-race
DEBUG
+5% attack

# item probe-item
DEBUG
slot: hand
value: 1

# shop probe-shop
DEBUG
coin: pebble
stocks:
  1 probe-item

# passive probe-passive
DEBUG
life, +1 max-health

# cluster-jewel probe-cluster-jewel
DEBUG
shape: spindle
open-connections: e
passives: 1 probe-passive

# faction probe-faction
DEBUG

# event probe-event
DEBUG
trigger: inventory-changed

# action probe-action
DEBUG
rate: us.attack
accuracy: us.attack vs them.attack
damage: us.attack vs them.attack
depletes: them.health

# entity probe-entity
DEBUG
stats: max-health 1

# guise probe-guise
DEBUG
without: probe-action

# location probe-location
DEBUG
x: 9, y: 9

# region probe-region
DEBUG
holds:
  probe-location

# station probe-station
DEBUG

# damage-type probe-fire
DEBUG

# ladder probe-stat
DEBUG

# tier probe-tier
DEBUG

# profile probe-profile
DEBUG
rate: 1
pool: 1

# recipe probe-recipe
DEBUG
in: probe-item
out: probe-item
time: 1

# resource probe-resource
DEBUG
max: probe-stat

# droptable probe-droptable
DEBUG
give: 1 probe-item

# dialogue probe-dialogue
DEBUG
owner = probe-entity

node open:
  always
  goto open

# quest probe-quest
DEBUG

stage begun:
  complete

# flag probe-flag
DEBUG

# slot probe-slot
DEBUG
at: 2 1

# group probe-group
DEBUG
colour: #112233

# variable probe-variable
DEBUG
value: 1

# save probe-save
DEBUG
{"version":12}

# test probe-test
DEBUG
assert: stat.attack = 10
`;

const REGISTRY = loadUniverse([{ name: 'probe.dsl', text: PROBED }]);

interface Section {
  kind: string;
  id: string;
  local: string;
  debug: boolean;
}

const DECLARED: Section[] = contentSectionMaps().flatMap(([kind, map]) =>
  [...(mapOf(REGISTRY, map) as ReadonlyMap<string, object>)].map(([id, value]) => ({
    kind,
    id,
    local: localId(isOwnedKind(kind) ? (REGISTRY.namespace.ownerOf(kind, id) ?? null) : null, id),
    debug: isDebug(value),
  })),
);

function said(status: unknown): string[] {
  if (typeof status === 'string') return [status];
  if (Array.isArray(status)) return status.flatMap(said);
  if (status === null || typeof status !== 'object') return [];
  return Object.entries(status).flatMap(([key, value]) => [key, ...said(value)]);
}

const SHEETS = said(sessionStatus(startSession(REGISTRY)));

const named = (section: Section): string[] => SHEETS.filter((text) => text.includes(section.local));

describe('what the sheets a player reads may name', () => {
  it.each(contentSectionMaps().map(([kind]) => kind))('is asked of a # %s, so no kind goes unprobed', (kind) => {
    expect(DECLARED.filter((section) => section.kind === kind && section.debug).length).toBeGreaterThan(0);
  });

  it('names what the world declares for a player, so nothing below passes by reading an empty screen', () => {
    expect(DECLARED.filter((section) => !section.debug && named(section).length > 0).map((section) => `# ${section.kind} ${section.id}`).length).toBeGreaterThan(4);
  });

  it('names nothing a DEBUG section declares, under any kind and on any sheet', () => {
    expect(DECLARED.filter((section) => section.debug).flatMap((section) => named(section).map((text) => `# ${section.kind} ${section.id}: ${JSON.stringify(text)}`))).toEqual([]);
  });
});
