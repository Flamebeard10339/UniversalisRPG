import path from 'node:path';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic, type Registry } from '../src/content/registry';
import { shippedSources } from '../src/content/shipped';
import { equip } from '../src/runtime/equipment';
import { receiveItem } from '../src/runtime/itemInstance';
import { initialState, serializeSave } from '../src/runtime/save';
import { activitiesIn, poolForTier, type Activity } from './lib/tiers';

const usage = [
  'Usage: npm run tier-build -- <activity> <level> [<item>...]',
  '',
  '  <activity>   a module that declares skills, as `npm run tier-build -- --list` prints them',
  '  <level>      the level every skill of that activity is brought to',
  '  <item>       gear to hand over and put on, in the order it should be tried. `<id>:<count>`',
  '               hands over a stock of it, which is what bait and anything else spent by using it',
  '               wants -- a tier has everything it beat and every shop, so nothing here is budgeted',
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
].join('\n');

export interface TierArgs {
  activity: string;
  level: number;
  items: string[];
  list: boolean;
}

export function parseTierArgs(raw: readonly string[]): TierArgs {
  if (raw.includes('--help') || raw.includes('-h')) throw new Error(usage);
  if (raw.includes('--list')) return { activity: '', level: 0, items: [], list: true };
  const [activity, level, ...items] = raw;
  if (activity === undefined || level === undefined) throw new Error(`name an activity and a level\n\n${usage}`);
  const at = Number(level);
  if (!Number.isInteger(at) || at < 1) throw new Error(`a level is a whole number of at least 1, not ${level}`);
  return { activity, level: at, items, list: false };
}

// What the build was handed, and what became of it. A refusal is the engine's own sentence, so a
// tier that cannot yet wear the good gloves says so in the words a player would have read.
export interface Worn {
  item: string;
  refused?: string;
}

export interface Handed {
  item: string;
  count: number;
}

// `<id>:<count>`, or one of it. An id carries dots and never a colon, so the two cannot be confused
// for one another.
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
}

// The pool spent evenly, which is what "every skill of this activity at this level" means. It is
// spelled as the pool over the skills rather than as the level's cost so that the one place a tier's
// size is decided stays `poolForTier`.
export const evenlySpent = (activity: Activity, level: number): Record<string, number> =>
  Object.fromEntries(activity.skills.map((skill) => [skill, poolForTier(activity, level) / activity.skills.length]));

export function buildTier(registry: Registry, activity: Activity, level: number, items: readonly string[]): TierBuild {
  const state = initialState(registry);
  Object.assign(state.xp, evenlySpent(activity, level));

  const worn: Worn[] = [];
  for (const written of items) {
    const { item, count } = handedOver(written);
    // An item declaring an `item-level:` arrives as a copy of its own under an id the engine mints,
    // and is worn under that id rather than under its template's. Which items those are is asked of
    // the table rather than known here: whatever appeared in it is what was handed over.
    const before = new Set(Object.keys(state.instances.byId));
    receiveItem(state, registry, item, count);
    const minted = Object.keys(state.instances.byId).find((id) => !before.has(id));
    const refused = equip(state, registry, minted ?? item);
    worn.push(refused === undefined ? { item } : { item, refused: String(refused) });
  }
  return { save: serializeSave(state, registry), worn };
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

  const built = buildTier(registry, activity, args.level, args.items);
  const refused = built.worn.filter((each) => each.refused !== undefined);
  return {
    lines: [
      `# save ${activity.id}-tier-${String(args.level)}`,
      built.save,
      '',
      `${activity.id} at level ${String(args.level)}: ${String(poolForTier(activity, args.level))} experience across ${activity.skills.join(' and ')}`,
      `worn: ${built.worn.filter((each) => each.refused === undefined).map((each) => each.item).join(', ') || 'nothing'}`,
      ...(refused.length === 0 ? [] : ['carried but not worn:', ...refused.map((each) => `  ${each.item} — ${each.refused!}`)]),
    ],
    ok: true,
  };
}

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
