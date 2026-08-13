import { BonusAmount } from '../src/grammar/tagClause';
import { ClusterReport, PayloadReport, PlaneReport, PositionReport, SlotReport, Standing } from '../src/runtime/planeReport';

// What each standing means to a player holding points, rather than what it is
// called in the plane: `free` is the origin root nobody paid for, `ready` is
// where the next point may go, and `dead` is a direction already foreclosed.
const STANDING: Record<Standing, string> = { allocated: 'spent', available: 'ready', unreached: 'locked', blocked: 'dead' };

const COLUMNS = [7, 8] as const;

// Ids arrive namespaced and a player types the short name, so the view spells
// them the way the verbs and the DSL do rather than the way the registry keys
// them.
const bare = (id: string): string => id.split('.').pop() ?? id;

interface Row {
  standing: string;
  node: string;
  what: string;
  worth: string;
  command: string;
}

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
  return `${magnitude(report.effective)} ${bare(report.statId)}${scale}`;
}

function worth(payloads: readonly PayloadReport[]): string {
  return payloads.map(payload).join(', ');
}

function positionRow(plane: PlaneReport, cluster: ClusterReport, position: PositionReport): Row {
  const address = `${plane.instance} at ${cluster.hex} position ${position.position}`;
  return {
    standing: position.free ? 'free' : STANDING[position.standing],
    node: `pos ${position.position}`,
    what: position.title ?? '(empty)',
    worth: worth(position.payloads),
    command: position.standing === 'available' ? `allocate: ${address}` : '',
  };
}

// A slot the player has paid for but not filled is the one place the next verb
// is `slot:` rather than `allocate:`, and it is the step a plane is most easily
// left stalled on, so it names the verb with the jewel left blank.
function slotCommand(plane: PlaneReport, cluster: ClusterReport, slot: SlotReport): string {
  if (slot.standing === 'available') return `allocate: ${plane.instance} at ${cluster.hex} slot ${slot.direction}`;
  if (slot.standing === 'allocated' && slot.beyond === null) return `slot: ${plane.instance} at ${cluster.hex} ${slot.direction} with <jewel>`;
  return '';
}

function beyond(slot: SlotReport): string {
  if (slot.beyond === null) return '';
  return slot.standing === 'blocked' ? `blocked by ${slot.beyond}` : `holds ${slot.beyond}`;
}

function slotRow(plane: PlaneReport, cluster: ClusterReport, slot: SlotReport): Row {
  return {
    standing: STANDING[slot.standing],
    node: `slot ${slot.direction}`,
    what: beyond(slot),
    worth: '',
    command: slotCommand(plane, cluster, slot),
  };
}

// The hexagon in hand is marked in the margin, so which of three things a
// growth line names is read off the screen rather than remembered.
function clusterHeading(cluster: ClusterReport, focused: boolean): string[] {
  const from = cluster.entry === null ? 'origin' : `via ${cluster.entry.hex} ${cluster.entry.direction}`;
  const heading = `${focused ? '> ' : '  '}${cluster.hex}  ${bare(cluster.jewel)} · ${cluster.shape} · ${from} · mods ${cluster.effects.length}/${cluster.modSlots}`;
  if (cluster.effects.length === 0) return [heading];
  const effects = cluster.effects.map((each) => `${each.title} ${signed(each.effect.percent)}% ${bare(each.effect.statId)}`);
  return [heading, `       ${effects.join(', ')}`];
}

function heading(plane: PlaneReport, worn: boolean): string {
  const points = plane.remaining === 1 ? '1 point left' : `${plane.remaining} points left`;
  return `${plane.title} — ${plane.instance} (${bare(plane.template)})${worn ? ' — worn' : ''} — level ${plane.level}/${plane.maxLevel}, ${plane.spent} spent, ${points}`;
}

function pad(rows: readonly Row[]): string[] {
  const what = Math.max(0, ...rows.map((row) => row.what.length));
  const value = Math.max(0, ...rows.map((row) => row.worth.length));
  return rows.map((row) =>
    `    ${row.standing.padEnd(COLUMNS[0])}${row.node.padEnd(COLUMNS[1])}${row.what.padEnd(what + 2)}${row.worth.padEnd(value + 2)}${row.command}`.trimEnd(),
  );
}

// One plane, and every hex and direction spelled the way the four verbs take
// them, so the line a player reads is the line they type back. `focused` is the
// hexagon a screen holding this plane has in hand, or null where it is read
// without one.
export function formatPlane(plane: PlaneReport, worn: boolean, focused: string | null): string[] {
  const lines = [heading(plane, worn)];
  for (const cluster of plane.clusters) {
    const rows = [
      ...cluster.positions.map((position) => positionRow(plane, cluster, position)),
      ...cluster.slots.map((slot) => slotRow(plane, cluster, slot)),
    ];
    lines.push('', ...clusterHeading(cluster, cluster.hex === focused), ...pad(rows));
  }
  return lines;
}
