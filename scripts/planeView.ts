import { EngineKey } from '../src/content/locale';
import { BonusAmount } from '../src/grammar/tagClause';
import { Localized, Localizer } from '../src/runtime/localized';
import { ClusterReport, PayloadReport, PlaneReport, PositionReport, SlotReport, Standing } from '../src/runtime/planeReport';

// Every line one plane is drawn as. Named so the published-surface walk has a
// root here (c1): this file invents no word, so a `string[]` return would be
// the one edit that put English back into it without anything going red.
export type PlaneLines = readonly Localized[];

// What each standing means to a player holding points, rather than what it is
// called in the plane. The words are the shell's, keyed once and read by
// whichever driver is drawing, so a terminal and a screen cannot end up saying
// different things about the same node (c5).
const STANDING: Record<Standing, EngineKey> = { allocated: 'engine.shell.spent', available: 'engine.shell.ready', unreached: 'engine.shell.locked', blocked: 'engine.shell.dead' };

// The node column takes the longest thing that goes in it: `Slot ne` is short and
// `Position 10` is not, and both are one key away from being longer in another
// language.
const COLUMNS = [7, 12] as const;

// Ids arrive namespaced and a player types the short name, so the view spells
// them the way the verbs and the DSL do rather than the way the registry keys
// them.
const bare = (id: string): string => id.split('.').pop() ?? id;

interface Row {
  standing: Localized;
  node: Localized;
  what: Localized;
  worth: Localized;
}

// A cell is a word the localizer produced and a column is a width, so a row of
// them padded out to their columns is still exactly what the localizer said.
// The one seam in this file where a line is laid out, and the only reason it
// reaches for `identifier` — what it adds is spaces.
const laidOut = (localizer: Localizer, cells: readonly Localized[], widths: readonly number[]): Localized =>
  localizer.identifier(cells.map((cell, at) => cell.padEnd(widths[at] ?? 0)).join('').trimEnd());

function trim(value: number): string {
  return String(Number(value.toFixed(2)));
}

function signed(value: number): string {
  return value < 0 ? trim(value) : `+${trim(value)}`;
}

function magnitude(bonus: BonusAmount): string {
  if (bonus.percent) return `${signed(bonus.amount)}%`;
  if (bonus.amount.min === bonus.amount.max) return signed(bonus.amount.min);
  return `${signed(bonus.amount.min)}-${trim(Math.abs(bonus.amount.max))}`;
}

// The effective number leads and the factor that made it trails, so a reader
// never has to multiply to know what a position pays (c19).
function payload(report: PayloadReport): string {
  const scale = report.scale === 1 ? '' : ` ×${trim(report.scale)}`;
  return `${magnitude(report.effective)} ${report.statTitle}${scale}`;
}

function worth(payloads: readonly PayloadReport[], localizer: Localizer): Localized {
  return localizer.identifier(payloads.map(payload).join(', '));
}

function positionRow(position: PositionReport, localizer: Localizer): Row {
  return {
    standing: localizer.engine(position.free ? 'engine.shell.free' : STANDING[position.standing]),
    node: localizer.engine('engine.shell.node.position', { position: position.position }),
    what: position.title ?? localizer.engine('engine.repl.plane.empty'),
    worth: worth(position.payloads, localizer),
  };
}

function beyond(slot: SlotReport, localizer: Localizer): Localized {
  if (slot.beyond === null) return localizer.identifier('');
  return localizer.engine(slot.standing === 'blocked' ? 'engine.repl.plane.blocked' : 'engine.repl.plane.holds', { beyond: localizer.identifier(slot.beyond) });
}

function slotRow(slot: SlotReport, localizer: Localizer): Row {
  return {
    standing: localizer.engine(STANDING[slot.standing]),
    node: localizer.engine('engine.shell.node.slot', { direction: localizer.identifier(slot.direction) }),
    what: beyond(slot, localizer),
    worth: localizer.identifier(''),
  };
}

// The hexagon in hand is marked in the margin, so which of three things a
// growth line names is read off the screen rather than remembered.
function clusterHeading(cluster: ClusterReport, focused: boolean, localizer: Localizer): Localized[] {
  const from =
    cluster.entry === null
      ? localizer.engine('engine.repl.plane.origin')
      : localizer.engine('engine.repl.plane.via', { hex: localizer.identifier(cluster.entry.hex), direction: localizer.identifier(cluster.entry.direction) });
  const heading = localizer.engine('engine.repl.plane.cluster', {
    hex: localizer.identifier(cluster.hex),
    jewel: localizer.identifier(bare(cluster.jewel)),
    shape: localizer.identifier(cluster.shape),
    from,
    mods: cluster.effects.length,
    slots: cluster.modSlots,
  });
  const marked = laidOut(localizer, [localizer.identifier(focused ? '>' : ''), heading], [2]);
  if (cluster.effects.length === 0) return [marked];
  const effects = cluster.effects.map((each) =>
    localizer.engine('engine.repl.plane.effect', { effect: each.title, amount: localizer.identifier(signed(each.effect.percent)), stat: each.statTitle }),
  );
  return [marked, laidOut(localizer, [localizer.identifier(''), localizer.identifier(effects.join(', '))], [7])];
}

function heading(plane: PlaneReport, worn: boolean, localizer: Localizer): Localized {
  const points = plane.remaining === 1 ? localizer.engine('engine.repl.plane.points.one') : localizer.engine('engine.repl.plane.points.many', { points: plane.remaining });
  return localizer.engine(worn ? 'engine.repl.plane.heading.worn' : 'engine.repl.plane.heading', {
    plane: plane.name,
    level: plane.level,
    max: plane.maxLevel,
    spent: plane.spent,
    points,
  });
}

function pad(rows: readonly Row[], localizer: Localizer): Localized[] {
  const what = Math.max(0, ...rows.map((row) => row.what.length));
  const widths = [4, COLUMNS[0], COLUMNS[1], what + 2];
  return rows.map((row) => laidOut(localizer, [localizer.identifier(''), row.standing, row.node, row.what, row.worth], widths));
}

// One plane, as what standing on it is worth. c17: no row spells the directive
// that would act on it, because the screen this is drawn above publishes that
// act as an option a number answers. `focused` is the hexagon a screen holding
// this plane has in hand, or null where it is read without one.
export function formatPlane(plane: PlaneReport, worn: boolean, focused: string | null, localizer: Localizer): PlaneLines {
  const lines = [heading(plane, worn, localizer)];
  for (const cluster of plane.clusters) {
    const rows = [...cluster.positions.map((position) => positionRow(position, localizer)), ...cluster.slots.map((slot) => slotRow(slot, localizer))];
    lines.push(localizer.identifier(''), ...clusterHeading(cluster, cluster.hex === focused, localizer), ...pad(rows, localizer));
  }
  return lines;
}
