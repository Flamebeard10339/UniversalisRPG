import path from 'node:path';
import type { Direction, Hex, PlaneNode } from '../src/content/hex';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic, type Registry } from '../src/content/registry';
import type { Item } from '../src/content/sections/item';
import { shippedSources } from '../src/content/shipped';
import { applyClusterEffect } from '../src/runtime/clusterEffect';
import { isAllocated, neighbours, nodeKey, placementAt, planeClusters, rootPosition, slotState, type Plane } from '../src/runtime/clusterPlane';
import { equip } from '../src/runtime/equipment';
import { allocate, itemInstance, itemTemplate, pointsRemaining, receiveItem, slotJewel, type ItemInstance } from '../src/runtime/itemInstance';
import { initialState, serializeSave } from '../src/runtime/save';
import { statValue } from '../src/runtime/stats';
import type { GameState } from '../src/runtime/state';
import { activitiesIn, poolForTier, type Activity } from './lib/tiers';

const usage = [
  'Usage: npm run tier-build -- <activity> <level> [<item>...] [--grow <stat>...]',
  '',
  '  <activity>   a module that declares skills, as `npm run tier-build -- --list` prints them',
  '  <level>      the level every skill of that activity is brought to',
  '  <item>       gear to hand over and put on, in the order it should be tried. `<id>:<count>`',
  '               hands over a stock of it, which is what bait and anything else spent by using it',
  '               wants -- a tier has everything it beat and every shop, so nothing here is budgeted.',
  '               A jewel or a cluster-effect orb is an item like any other: hand it over here and',
  '               it is there for --grow to reach for',
  '  --grow       the stats the build is trying for, best first. With it, every point every worn piece',
  "               dropped with is spent, through the engine's own doors. Without it nothing is spent,",
  '               which is a character at roughly half of what its gear allows',
  '',
  'Prints the `# save` section for a reference build, to paste into the corpus. Nothing here is',
  'modelled: the experience is the curve read at that level, and the gear is handed over and worn',
  "through the engine's own doors, so what a build ends up wearing is what the engine let it wear.",
  '',
  'A tier is one skill climb for each skill the activity uses -- two for combat, one for fishing --',
  'and this spends it evenly. That is the floor a search starts from rather than the answer: the',
  'pool is a real degree of freedom, and whether the best combat build at a tier pours everything',
  'into attack is a question this tool is the starting point for and not the end of.',
  '',
  'Gear a level does not reach is refused by the engine and the refusal is printed. So the list may',
  "name the whole of an activity's kit at every tier, and each tier wears the part of it it has",
  'earned -- what a build may wear is never written down here.',
  '',
  'The rule --grow spends by is greedy, and is a floor rather than an answer in exactly the way the',
  'even split above is: it takes the next move whose finished plane reads highest, one piece at a',
  'time and in the order they went on, so a piece that goes on first takes the jewels it likes and a',
  'corridor that would have paid three nodes later is never crossed. Nothing here knows what any',
  'passive or jewel is worth -- each move is applied and the stat is read back -- so the answer moves',
  'when the world does, and a better search would replace this one without replacing anything else.',
  '',
  'A cluster-effect orb handed over here is a third move, tried on every hex that already carries a',
  'jewel with an open mod slot, through the engine\'s own applyClusterEffect -- the same door a',
  'player uses, never a model of what the effect is worth. Which items count is read off cluster-',
  'effect: the way a jewel candidate is read off cluster-jewel:, so an orb the corpus adds next',
  'month needs no edit here. Applying one is one-way -- these doors never take an orb back off a',
  'hex -- so the rule refuses to spend one where every candidate reads no better than leaving the',
  'hex alone. Short of that floor it keeps the same looseness as the other two moves: the first orb',
  'that clears the bar stands even where a later hex would have paid it back better, and a hex is',
  'never revisited once its budget of mod slots is spent trying the wrong one first.',
].join('\n');

export interface TierArgs {
  activity: string;
  level: number;
  items: string[];
  grow: string[];
  list: boolean;
}

export function parseTierArgs(raw: readonly string[]): TierArgs {
  if (raw.includes('--help') || raw.includes('-h')) throw new Error(usage);
  if (raw.includes('--list')) return { activity: '', level: 0, items: [], grow: [], list: true };
  const cut = raw.indexOf('--grow');
  const [activity, level, ...items] = cut < 0 ? raw : raw.slice(0, cut);
  const grow = cut < 0 ? [] : raw.slice(cut + 1);
  if (activity === undefined || level === undefined) throw new Error(`name an activity and a level\n\n${usage}`);
  const at = Number(level);
  if (!Number.isInteger(at) || at < 1) throw new Error(`a level is a whole number of at least 1, not ${level}`);
  if (cut >= 0 && grow.length === 0) throw new Error(`--grow wants at least one stat to grow toward\n\n${usage}`);
  return { activity, level: at, items, grow, list: false };
}

export interface Worn {
  item: string;
  refused?: string;
}

export interface Handed {
  item: string;
  count: number;
}

export function handedOver(written: string): Handed {
  const cut = written.lastIndexOf(':');
  if (cut < 0) return { item: written, count: 1 };
  const count = Number(written.slice(cut + 1));
  if (!Number.isInteger(count) || count < 1) throw new Error(`${written}: a stock is a whole number of at least 1`);
  return { item: written.slice(0, cut), count };
}

export interface TierBuild {
  save: string;
  worn: Worn[];
  grown?: Grown;
}

export interface Grown {
  spent: number;
  unspent: number;
  before: Record<string, number>;
  after: Record<string, number>;
}

type Move = { kind: 'allocate'; node: PlaneNode } | { kind: 'socket'; hex: Hex; direction: Direction; jewel: string } | { kind: 'effect'; hex: Hex; effect: string };

const applyMove = (state: GameState, registry: Registry, target: string, move: Move): boolean =>
  (move.kind === 'allocate'
    ? allocate(state, registry, target, move.node)
    : move.kind === 'socket'
      ? slotJewel(state, registry, target, move.jewel, move.hex, move.direction)
      : applyClusterEffect(state, registry, target, move.effect, move.hex)
  ).ok;

function standing(registry: Registry, plane: Plane): PlaneNode[] {
  const nodes = new Map<string, PlaneNode>();
  const keep = (node: PlaneNode): void => {
    if (isAllocated(registry, plane, node)) nodes.set(nodeKey(node), node);
  };
  for (const { hex, cluster } of planeClusters(plane)) {
    for (const position of cluster.allocatedPositions) keep({ hex, kind: 'position', position });
    for (const direction of cluster.allocatedSlots) keep({ hex, kind: 'slot', direction });
    const placement = placementAt(registry, plane, hex);
    if (placement) keep({ hex, kind: 'position', position: rootPosition(placement.jewel) });
  }
  return [...nodes.values()];
}

function movesFrom(registry: Registry, plane: Plane, jewels: readonly string[], effects: readonly string[], canAllocate: boolean): Move[] {
  const moves: Move[] = [];
  if (canAllocate) {
    const seen = new Set<string>();
    for (const node of standing(registry, plane)) {
      for (const next of neighbours(registry, plane, node)) {
        if (isAllocated(registry, plane, next) || seen.has(nodeKey(next))) continue;
        seen.add(nodeKey(next));
        moves.push({ kind: 'allocate', node: next });
      }
    }
  }
  for (const { hex, cluster } of planeClusters(plane)) {
    for (const direction of cluster.allocatedSlots) {
      if (slotState(registry, plane, hex, direction) !== 'open') continue;
      for (const jewel of jewels) moves.push({ kind: 'socket', hex, direction, jewel });
    }
    const placement = placementAt(registry, plane, hex);
    if (placement === undefined || cluster.effects.length >= placement.jewel.modSlots) continue;
    for (const effect of effects) {
      if (cluster.effects.includes(effect)) continue;
      moves.push({ kind: 'effect', hex, effect });
    }
  }
  return moves;
}

interface Undo {
  plane: Plane;
  inventory: Record<string, number>;
  rng: number;
}

const snapshot = (state: GameState, payload: ItemInstance): Undo => ({ plane: structuredClone(payload.plane), inventory: { ...state.inventory }, rng: state.rng });

function undo(state: GameState, payload: ItemInstance, taken: Undo): void {
  payload.plane = taken.plane;
  state.inventory = taken.inventory;
  state.rng = taken.rng;
}

const reading = (state: GameState, registry: Registry, stats: readonly string[]): number[] => stats.map((id) => statValue(id, state, registry));

function beats(one: readonly number[], other: readonly number[]): boolean {
  for (let at = 0; at < one.length; at++) {
    if (Math.abs(one[at]! - other[at]!) > 1e-9) return one[at]! > other[at]!;
  }
  return false;
}

const GUARD = 500;

function spendPlane(state: GameState, registry: Registry, target: string, item: Item, stats: readonly string[], jewels: readonly string[], effects: readonly string[], playedOut: boolean): number {
  let spent = 0;
  for (let guard = 0; guard < GUARD; guard++) {
    const payload = itemInstance(state, target);
    if (!payload) break;
    const canAllocate = pointsRemaining(payload, item) > 0;
    const baseline = reading(state, registry, stats);

    let chosen: Move | undefined;
    let best: number[] | undefined;
    for (const move of movesFrom(registry, payload.plane, jewels, effects, canAllocate)) {
      const taken = snapshot(state, payload);
      const made = applyMove(state, registry, target, move);
      if (made) {
        if (playedOut) spendPlane(state, registry, target, item, stats, jewels, effects, false);
        const score = reading(state, registry, stats);
        const worthwhile = move.kind !== 'effect' || beats(score, baseline);
        if (worthwhile && (best === undefined || beats(score, best))) [chosen, best] = [move, score];
      }
      undo(state, payload, taken);
    }
    if (!chosen || !applyMove(state, registry, target, chosen)) break;
    if (chosen.kind === 'allocate') spent += 1;
  }
  return spent;
}

export function growWorn(state: GameState, registry: Registry, stats: readonly string[], jewels: readonly string[], effects: readonly string[]): Grown {
  const named = (values: number[]): Record<string, number> => Object.fromEntries(stats.map((id, at) => [id, values[at]!]));
  const before = reading(state, registry, stats);
  let spent = 0;
  let unspent = 0;
  for (const worn of Object.values(state.equipped)) {
    const item = registry.items.get(itemTemplate(state, worn));
    if (!item || !itemInstance(state, worn)) continue;
    spent += spendPlane(state, registry, worn, item, stats, jewels, effects, true);
    unspent += Math.max(0, pointsRemaining(itemInstance(state, worn)!, item));
  }
  return { spent, unspent, before: named(before), after: named(reading(state, registry, stats)) };
}

export const evenlySpent = (activity: Activity, level: number): Record<string, number> =>
  Object.fromEntries(activity.skills.map((skill) => [skill, poolForTier(activity, level) / activity.skills.length]));

export function tierState(registry: Registry, activity: Activity, level: number): GameState {
  const state = initialState(registry);
  Object.assign(state.xp, evenlySpent(activity, level));
  return state;
}

export function buildTier(registry: Registry, activity: Activity, level: number, items: readonly string[], grow: readonly string[] = []): TierBuild {
  const state = tierState(registry, activity, level);

  const worn: Worn[] = [];
  for (const written of items) {
    const { item, count } = handedOver(written);
    const before = new Set(Object.keys(state.instances.byId));
    receiveItem(state, registry, item, count);
    if (registry.items.get(item)?.slot === undefined) continue;
    const minted = Object.keys(state.instances.byId).find((id) => !before.has(id));
    const refused = equip(state, registry, minted ?? item);
    worn.push(refused === undefined ? { item } : { item, refused: String(refused) });
  }
  const jewels = items.map((written) => handedOver(written).item).filter((item) => registry.items.get(item)?.clusterJewel !== undefined);
  const effects = items.map((written) => handedOver(written).item).filter((item) => registry.items.get(item)?.clusterEffect !== undefined);
  const grown = grow.length === 0 ? undefined : growWorn(state, registry, grow, jewels, effects);
  return { save: serializeSave(state, registry), worn, grown };
}

export function tierLines(registry: Registry, args: TierArgs): { lines: string[]; ok: boolean } {
  const activities = activitiesIn(registry);
  if (args.list) {
    return { lines: activities.map((activity) => `${activity.id}: ${activity.skills.join(', ')}`), ok: true };
  }
  const activity = activities.find((each) => each.id === args.activity);
  if (!activity) return { lines: [`${args.activity}: no module declares a skill under that name. Try: ${activities.map((each) => each.id).join(', ')}`], ok: false };

  const unknown = args.items.map((written) => handedOver(written).item).filter((item) => !registry.items.has(item));
  if (unknown.length > 0) return { lines: [`no # item is declared under: ${unknown.join(', ')}`], ok: false };

  const unnamed = args.grow.filter((stat) => !registry.stats.has(stat));
  if (unnamed.length > 0) return { lines: [`no # stat is declared under: ${unnamed.join(', ')}`], ok: false };

  const built = buildTier(registry, activity, args.level, args.items, args.grow);
  const refused = built.worn.filter((each) => each.refused !== undefined);
  return {
    lines: [
      `# save ${activity.id}-tier-${String(args.level)}`,
      built.save,
      '',
      `${activity.id} at level ${String(args.level)}: ${String(poolForTier(activity, args.level))} experience across ${activity.skills.join(' and ')}`,
      `worn: ${built.worn.filter((each) => each.refused === undefined).map((each) => each.item).join(', ') || 'nothing'}`,
      ...(refused.length === 0 ? [] : ['carried but not worn:', ...refused.map((each) => `  ${each.item} — ${each.refused!}`)]),
      ...grownLines(built.grown),
    ],
    ok: true,
  };
}

const grownLines = (grown: Grown | undefined): string[] =>
  grown === undefined
    ? []
    : [
        `grown: ${String(grown.spent)} points spent, ${String(grown.unspent)} the greedy rule could not reach`,
        ...Object.keys(grown.before).map((stat) => `  ${stat} ${grown.before[stat]!.toFixed(1)} -> ${grown.after[stat]!.toFixed(1)}`),
      ];

function main(): void {
  let args: TierArgs;
  try {
    args = parseTierArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  const loaded = loadUniverseWithDiagnostics(shippedSources());
  if (loaded.diagnostics.length > 0) {
    console.error(loaded.diagnostics.map(formatModuleDiagnostic).join('\n'));
    process.exit(1);
  }
  const report = tierLines(loaded.registry, args);
  console.log(report.lines.join('\n'));
  if (!report.ok) process.exit(1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
