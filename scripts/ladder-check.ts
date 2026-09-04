import path from 'node:path';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic, type Registry } from '../src/content/registry';
import { droptable } from '../src/content/sections/droptable';
import { isBase, type Item } from '../src/content/sections/item';
import type { Skill } from '../src/content/sections/skill';
import { shippedSources } from '../src/content/shipped';
import { readSources } from './probe';
import { midpoint } from '../src/grammar/range';
import { wearable } from '../src/runtime/equipment';
import { itemContribution } from '../src/runtime/itemContribution';
import { abilityAtLevelIn } from '../src/runtime/pace';
import { activitiesIn, type Activity } from './lib/tiers';
import { buildTier, tierState } from './tier-build';
import { activityFor, ladderedFor, readingAt, SURVIVAL_WINDOW_SECONDS, type Fighter } from '../src/runtime/foeTier';
import { fairAt, fightersIn, shapeDisagrees, shapeOf } from './lib/foeTier';

export const TOP_RUNG = 30;
export const RUNG_STEP = 10;

export function defaultRungs(): number[] {
  const rungs = [1];
  for (let level = RUNG_STEP; level <= TOP_RUNG; level += RUNG_STEP) rungs.push(level);
  return rungs;
}

const usage = [
  'Usage: npm run ladder-check [-- <skill>...] [--world <dir>] [--levels <level>[,<level>...]]',
  '',
  '  <skill>    narrows the report to the skills named, written whole as thieving.thieving.',
  '             With none, every skill the world declares is read',
  `  --levels   the rungs to read at, in order (default ${defaultRungs().join(', ')})`,
  '  --world    <dir> — read the world in that directory rather than the shipped corpus,',
  '             which is what an authoring run reaches for: its draft lives in a copy of its',
  '             own, and a residual read off the shipped tree says nothing about it',
  '',
  'Balance pins two lines. `src/runtime/pace.ts` already says how long a level is meant to',
  'take; beside it now stands the ladder — what a character of that level is assumed to be',
  'able to stand at in the stat their skill raises. Both are declared rather than measured,',
  'and declaring the second is what breaks the circle a balance pass otherwise walks: a',
  'difficulty cannot be set until the gear that meets it is known, and the gear cannot be',
  'audited until the difficulties are set.',
  '',
  'So this prints, per skill and per rung, what the world can actually put on such a',
  'character, what the ladder asks of them, and the difference between the two. That',
  'difference is the whole finding. Short of the ladder is gear the world has not got yet;',
  'over it is gear the ladder was not written for.',
  '',
  'Two rows stand under every rung, because that is the distinction a balance pass turns on:',
  'what a character reaches out of a shop, which is gear anyone can walk in and buy, and what',
  'they reach if everything that drops falls their way as well. A rung whose two rows are far',
  'apart is a rung where the declared character and the shopping character are different people.',
  '',
  'Nothing here is listed. The skills are the ones the registry holds and the stat is the one',
  'each declares; the gear is every item whose bonuses reach that stat, or that carries a plane',
  'a jewel reaching it can go into; whether a piece can be bought is read off `stocks:` and',
  'whether it drops is read off the droptables, followed through a roll into another table. What',
  'a level grants is inside every figure, because the character is stood up at that level before',
  'anything is put on them, and a piece the level has not earned is refused by the engine rather',
  'than by a rule here.',
  '',
  'That character is a specialist. Every skill of the module the read skill belongs to stands at',
  'the rung and no other skill has been climbed at all, so a piece gated on somebody else\'s levels',
  'is refused — which is the right refusal for a ladder read one skill at a time, and the wrong one',
  'for a character who plays more than one.',
  '',
  'The build is `npm run tier-build --grow`, which is greedy and order-dependent, and the order',
  'it is fed is one piece per slot: the piece with the most plane points where a jewel or a',
  'cluster-effect orb reaching the stat exists to fill them, and the piece with the biggest bonus',
  'of its own where neither does. So every figure below is a floor — the build a plain rule',
  'arrives at — and not the best build the pieces allow. A cluster-effect orb is one of the',
  'greedy\'s moves now, applied to any hex already holding a jewel with an open mod slot; it is',
  'never spent where every candidate reads no better than leaving the hex alone, but short of that',
  'floor the greedy still takes the first one that clears the bar rather than the best one, and a',
  'hex is never revisited once its mod slots are spent on the wrong orb first — so a stat whose',
  'gear leans on orbs can still read lower here than the best build reaches.',
  '',
  'This is a tool and not a gate. It asserts nothing, CI does not run it, and it always exits 0',
  'unless the arguments or the corpus are refused.',
].join('\n');

export interface LadderArgs {
  skills: string[];
  levels: number[];
  world?: string;
}

export function parseLadderArgs(raw: readonly string[]): LadderArgs {
  const skills: string[] = [];
  let levels: number[] | undefined;
  let world: string | undefined;
  for (let at = 0; at < raw.length; at += 1) {
    const arg = raw[at]!;
    if (arg === '--help' || arg === '-h') throw new Error(usage);
    if (arg === '--levels') {
      const spec = raw[at + 1];
      at += 1;
      if (spec === undefined) throw new Error(`--levels wants <level>[,<level>...] after it\n\n${usage}`);
      levels = spec.split(',').map((written) => {
        const level = Number(written);
        if (!Number.isInteger(level) || level < 1) throw new Error(`--levels takes whole levels of at least 1, and ${JSON.stringify(written)} is not one`);
        return level;
      });
      if (levels.length === 0) throw new Error('--levels wants at least one rung');
      continue;
    }
    if (arg === '--world') {
      const dir = raw[at + 1];
      at += 1;
      if (dir === undefined) throw new Error(`--world wants the directory of a world after it\n\n${usage}`);
      world = dir;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`unknown flag ${arg}\n\n${usage}`);
    skills.push(arg);
  }
  return { skills, levels: levels ?? defaultRungs(), ...(world === undefined ? {} : { world }) };
}

export interface Source {
  readonly title: string;
  readonly holds: (itemId: string) => boolean;
}

export function stockedItems(registry: Registry): Set<string> {
  const stocked = new Set<string>();
  for (const shop of registry.shops.values()) for (const entry of shop.stocks) stocked.add(entry.item);
  return stocked;
}

export function droppedItems(registry: Registry): Set<string> {
  const dropped = new Set<string>();
  const walked = new Set<string>();
  const walk = (tableId: string): void => {
    if (walked.has(tableId)) return;
    walked.add(tableId);
    const table = registry.dropTables.get(tableId);
    if (table === undefined) return;
    droptable.visit!(table, `# droptable ${tableId}`, (kind, id) => {
      if (kind === 'item') dropped.add(id);
      if (kind === 'droptable') walk(id);
      return id;
    });
  };
  for (const tableId of registry.dropTables.keys()) walk(tableId);
  return dropped;
}

export function sourcesIn(registry: Registry): Source[] {
  const stocked = stockedItems(registry);
  const anywhere = new Set([...stocked, ...droppedItems(registry)]);
  return [
    { title: 'a shop sells it', holds: (itemId) => stocked.has(itemId) },
    { title: 'it exists anywhere', holds: (itemId) => anywhere.has(itemId) },
  ];
}

export function directReach(registry: Registry, item: Item, statId: string): number {
  let reach = 0;
  for (const contribution of itemContribution(registry, item)) {
    if (contribution.statId === statId) reach += midpoint(contribution.added) + contribution.increased;
  }
  return reach;
}

export function jewelReaches(registry: Registry, itemId: string, statId: string): boolean {
  const carried = registry.items.get(itemId)?.clusterJewel;
  const jewel = carried === undefined ? undefined : registry.clusterJewels.get(carried);
  if (jewel === undefined) return false;
  return Object.values(jewel.positions).some((passiveId) => (registry.passives.get(passiveId)?.tags ?? []).some((tag) => tag.kind === 'stat-bonus' && tag.statId === statId));
}

export function effectReaches(registry: Registry, itemId: string, statId: string): boolean {
  return registry.items.get(itemId)?.clusterEffect?.statId === statId;
}

const planePoints = (item: Item): number => item.itemLevel?.max ?? 0;

const bestFirst = (registry: Registry, statId: string, planesPay: boolean) => (one: Item, other: Item): number => {
  const reach = (item: Item): number => directReach(registry, item, statId);
  const led = planesPay ? planePoints(other) - planePoints(one) || reach(other) - reach(one) : reach(other) - reach(one) || planePoints(other) - planePoints(one);
  return led || one.id.localeCompare(other.id);
};

export interface Kit {
  readonly worn: readonly Item[];
  readonly extras: readonly string[];
  readonly points: number;
}

export function kitFor(registry: Registry, activity: Activity, level: number, statId: string, holds: (itemId: string) => boolean): Kit {
  const standing = tierState(registry, activity, level);
  const extras = [...registry.items.values()].filter((item) => holds(item.id) && (jewelReaches(registry, item.id, statId) || effectReaches(registry, item.id, statId))).map((item) => item.id);
  const planesPay = extras.length > 0;
  const bySlot = new Map<string, Item[]>();
  for (const item of registry.items.values()) {
    if (item.slot === undefined || !holds(item.id)) continue;
    if (directReach(registry, item, statId) === 0 && !isBase(item)) continue;
    if (!wearable(standing, registry, item.id)) continue;
    bySlot.set(item.slot, [...(bySlot.get(item.slot) ?? []), item]);
  }
  const worn = [...bySlot.values()].map((all) => [...all].sort(bestFirst(registry, statId, planesPay))[0]!);
  return { worn, extras, points: worn.reduce((total, item) => total + planePoints(item), 0) };
}

export interface Delivered {
  readonly kit: Kit;
  readonly stood: number;
  readonly spent: number;
}

export function delivered(registry: Registry, activity: Activity, level: number, statId: string, holds: (itemId: string) => boolean): Delivered {
  const kit = kitFor(registry, activity, level, statId, holds);
  const stock = Math.max(1, kit.points);
  const handed = [...kit.worn.map((item) => item.id), ...kit.extras.map((id) => `${id}:${String(stock)}`)];
  const built = buildTier(registry, activity, level, handed, [statId]);
  return { kit, stood: built.grown!.after[statId]!, spent: built.grown!.spent };
}

const figure = (value: number): string => value.toFixed(1);

const residual = (stood: number, asked: number): string => {
  const off = stood - asked;
  if (Math.abs(off) < 0.05) return 'on the ladder';
  return `${figure(Math.abs(off))} ${off < 0 ? 'short' : 'over'}`;
};

const COLUMN = 22;

function rungLines(registry: Registry, activity: Activity, statId: string, level: number, sources: readonly Source[]): string[] {
  const asked = abilityAtLevelIn(registry, level, statId);
  return [
    `  level ${String(level)} — the ladder asks ${figure(asked)}`,
    ...sources.map((source) => {
      const read = delivered(registry, activity, level, statId, source.holds);
      const kit = `${String(read.kit.worn.length)} worn, ${String(read.spent)} of ${String(read.kit.points)} plane points spent, ${String(read.kit.extras.length)} jewel(s)/orb(s) to hand`;
      return `    ${source.title.padEnd(COLUMN)}${figure(read.stood).padStart(8)}  ·  ${residual(read.stood, asked).padEnd(16)}·  ${kit}`;
    }),
  ];
}

function skillLines(registry: Registry, skill: Skill, activity: Activity, args: LadderArgs, sources: readonly Source[]): string[] {
  const statId = skill.stat!;
  return ['', `# ${skill.id} — ${statId}`, ...args.levels.flatMap((level) => rungLines(registry, activity, statId, level, sources))];
}

const APART = 5;
const OUT_OF_TRUE = 1.5;

const share = (value: number): string => (Number.isFinite(value) ? `${value.toFixed(2)}x` : 'never');

function foeLine(registry: Registry, activity: Activity, fighter: Fighter, top: number): string[] | undefined {
  const laddered = ladderedFor(registry, fighter.fight);
  const tier = fighter.tier;
  if (!laddered || !tier) return undefined;
  const stood = tierState(registry, activity, 1);
  const say = (level: number | undefined): string => (level === undefined ? 'nowhere on the ladder' : `level ${String(level)}`);

  if (fighter.level !== undefined) {
    const at = readingAt(registry, stood, fighter, laddered, fighter.level);
    const fells = Number.isFinite(at.secondsToFell) ? `${at.secondsToFell.toFixed(0)}s of ${tier.secondsToFell.toFixed(0)}s` : `never, wanting ${tier.secondsToFell.toFixed(0)}s`;
    const hurts = `${share(at.damageShare)} of ${share(tier.damageShare)}`;
    const off = Number.isFinite(at.secondsToFell) && (at.secondsToFell > tier.secondsToFell * OUT_OF_TRUE || at.secondsToFell * OUT_OF_TRUE < tier.secondsToFell);
    const sore = Number.isFinite(at.damageShare) && (at.damageShare > tier.damageShare * OUT_OF_TRUE || at.damageShare * OUT_OF_TRUE < tier.damageShare);
    const verdict = !Number.isFinite(at.secondsToFell) || off || sore ? `  — ${[off && 'toughness', sore && 'damage'].filter(Boolean).join(' and ') || 'toughness'} off its tier` : '';
    return [`    ${fighter.entity.id.padEnd(34)}${tier.id.padEnd(8)}at its own level ${String(fighter.level).padEnd(4)}fells in ${fells.padEnd(20)}hurts at ${hurts.padEnd(18)}${verdict}`, ...shapeLines(registry, stood, fighter)];
  }

  const fair = fairAt(registry, stood, fighter, laddered, tier, top);
  const gap = fair.toughness !== undefined && fair.damage !== undefined ? Math.abs(fair.toughness - fair.damage) : undefined;
  const verdict = gap === undefined ? '  — one of the two never lands' : gap > APART ? `  — ${String(gap)} levels apart` : '';
  return [`    ${fighter.entity.id.padEnd(34)}${tier.id.padEnd(8)}names no level, so it reads as fells at ${say(fair.toughness).padEnd(18)}hurts at ${say(fair.damage).padEnd(18)}${verdict}`, ...shapeLines(registry, stood, fighter)];
}

function shapeLines(registry: Registry, stood: ReturnType<typeof tierState>, fighter: Fighter): string[] {
  const adrift = shapeDisagrees(shapeOf(registry, stood, fighter));
  if (adrift.length === 0) return [];
  const said = adrift.map((each) => `${each.factor} says ${each.said.toFixed(2)}x and reads ${share(each.read)}`).join('; ');
  return [`        its # profile ${String(fighter.entity.profile)} is not the shape it is cut in: ${said}`];
}

function foeLines(registry: Registry, args: LadderArgs): string[] {
  const fighters = fightersIn(registry);
  if (fighters.length === 0) return [];
  const top = Math.max(...args.levels);
  const lines: string[] = [];
  for (const fighter of fighters) {
    if (!fighter.tier) continue;
    const activity = activityFor(registry, fighter.fight);
    const said = activity && foeLine(registry, activity, fighter, top);
    if (said) lines.push(...said);
  }
  const untiered = fighters.filter((each) => !each.tier);
  const head = [
    '',
    '# what the world puts in front of a player, against the tier each names',
    `a tier says how long something stands and what share of survivable incoming it deals, both read against a player the ladder puts at that level; survivable is a full pool spent over ${String(SURVIVAL_WINDOW_SECONDS)} seconds.`,
    'a body that names its own level is read there, against both halves at once. One that names none is read the other way about — the level at which each half comes true — and halves that land far apart say it is cut wrong however either reads alone.',
    'a # profile says how the budget is spent, as a multiple of what the player stands at. Where the body is not cut in the shape it names, the factors that disagree are listed under it.',
  ];
  const quiet = untiered.length === 0 ? [] : ['', `    ${String(untiered.length)} thing(s) that fight name no tier and are audited against nothing: ${untiered.slice(0, 6).map((each) => each.entity.id).join(', ')}${untiered.length > 6 ? ', …' : ''}`];
  return [...head, ...(lines.length === 0 ? ['', '    nothing that fights names a tier yet.'] : lines), ...quiet];
}

export function ladderLines(registry: Registry, args: LadderArgs): { lines: string[]; ok: boolean } {
  const declared = [...registry.skills.values()];
  const unknown = args.skills.filter((id) => !registry.skills.has(id));
  if (unknown.length > 0) {
    return { lines: [`no # skill is declared under: ${unknown.join(', ')}. The world declares: ${declared.map((skill) => skill.id).join(', ')}`], ok: false };
  }
  const asked = args.skills.length === 0 ? declared : declared.filter((skill) => args.skills.includes(skill.id));
  const activities = activitiesIn(registry);
  const activityOf = (skill: Skill): Activity | undefined => activities.find((activity) => activity.skills.includes(skill.id));

  const read = asked.filter((skill) => skill.stat !== undefined && registry.stats.has(skill.stat) && activityOf(skill) !== undefined);
  const silent = asked.filter((skill) => !read.includes(skill));
  const sources = sourcesIn(registry);

  const head = [
    `the ladder against what the world can put on a character: ${String(read.length)} skill(s) at level ${args.levels.join(', ')}`,
    'every figure is read off a build stood up at that level and dressed through the engine\'s own doors, and is a floor rather than the best build the pieces allow.',
  ];
  const body = read.flatMap((skill) => skillLines(registry, skill, activityOf(skill)!, args, sources));
  const quiet = silent.length === 0 ? [] : ['', `${silent.map((skill) => skill.id).join(', ')} — no stat: to read a ladder on, so nothing here has anything to say about ${silent.length === 1 ? 'it' : 'them'}.`];
  return { lines: [...head, ...body, ...quiet, ...foeLines(registry, args)], ok: true };
}

function main(): void {
  let args: LadderArgs;
  try {
    args = parseLadderArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  const loaded = loadUniverseWithDiagnostics(args.world === undefined ? shippedSources() : readSources([args.world]));
  if (loaded.diagnostics.length > 0) {
    console.error(loaded.diagnostics.map(formatModuleDiagnostic).join('\n'));
    process.exit(1);
  }
  const report = ladderLines(loaded.registry, args);
  console.log(report.lines.join('\n'));
  if (!report.ok) process.exit(1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
