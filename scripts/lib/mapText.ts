import { COMPASS, compassOf, type Road, type Sheet, type Way } from '../../src/runtime/map';

// The map drawn as characters. Every fact in here comes off the sheet the engine built — which
// places, on which floor, joined by which roads, and which way each way out lies — so a terminal and
// the map pane are drawing one thing and can only disagree about how it looks.

const LABEL = 14;
const GAP = 3;
const COLUMN = LABEL + GAP;

const HERE = '>';
const SHUT = '·';
const UNFOUND = '?';
const UP = '^';
const DOWN = 'v';

const cut = (text: string, width: number): string => (text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`);

interface Cell {
  row: number;
  column: number;
  label: string;
}

function labelOf(node: Sheet['nodes'][number]): string {
  const climb = node.climb === 0 ? '' : node.climb > 0 ? UP : DOWN;
  const numbered = node.goes === null ? '' : `${node.goes}:`;
  // A place the player has not found is only ever drawn for an author, and is marked so that what is
  // on the map and what is in the world are never read as the same thing.
  return cut(`${node.here ? HERE : ''}${node.found ? '' : UNFOUND}${numbered}${climb}${String(node.place.title)}`, LABEL);
}

// The lattice the drawn positions make, with the columns and rows nothing stands on taken out. A
// terminal is eighty characters wide and a world is not, so what is kept is the order places stand in
// and not how far apart they were written. Roads are drawn between them, so nothing here claims two
// places touch — a square with no line to the square beside it is joined to nothing.
function lattice(sheet: Sheet): { cells: Map<string, Cell>; columns: number[]; rows: number[]; crowded: string[] } {
  const columns = [...new Set(sheet.nodes.map((node) => node.at.x))].sort((low, high) => low - high);
  const rows = [...new Set(sheet.nodes.map((node) => node.at.y))].sort((low, high) => low - high);
  const cells = new Map<string, Cell>();
  const taken = new Set<string>();
  const crowded: string[] = [];
  for (const node of sheet.nodes) {
    const at = `${rows.indexOf(node.at.y)},${columns.indexOf(node.at.x)}`;
    if (taken.has(at)) {
      crowded.push(`${labelOf(node)} is written on a square another place already holds`);
      continue;
    }
    taken.add(at);
    cells.set(String(node.place.id), { row: rows.indexOf(node.at.y), column: columns.indexOf(node.at.x), label: labelOf(node) });
  }
  return { cells, columns, rows, crowded };
}

const blank = (width: number, height: number): string[][] => Array.from({ length: height }, () => Array.from({ length: width }, () => ' '));

const write = (canvas: string[][], row: number, column: number, text: string): void => {
  for (let at = 0; at < text.length; at += 1) if (canvas[row] && column + at < canvas[row].length) canvas[row][column + at] = text[at]!;
};

const middleOf = (column: number): number => column * COLUMN + Math.floor(LABEL / 2);

const clear = (canvas: string[][], row: number, from: number, to: number): boolean => {
  for (let at = from; at < to; at += 1) if (canvas[row]?.[at] !== ' ') return false;
  return true;
};

// A road drawn as one line: along the row two places share, down the column they share, or across the
// corner between two a step apart each way. Nothing is written over anything already on the paper, so
// a road with a place in its way is left for the writing underneath.
function straight(canvas: string[][], road: Road, from: Cell, to: Cell): boolean {
  if (from.row === to.row) {
    const [left, right] = from.column < to.column ? [from, to] : [to, from];
    const span: [number, number] = [left.column * COLUMN + left.label.length, right.column * COLUMN];
    if (!clear(canvas, left.row * 2, span[0], span[1])) return false;
    write(canvas, left.row * 2, span[0], (road.open ? '─' : SHUT).repeat(span[1] - span[0]));
    return true;
  }
  const [top, low] = from.row < to.row ? [from, to] : [to, from];
  if (from.column === to.column) {
    const line = middleOf(top.column);
    if (!canvas.slice(top.row * 2 + 1, low.row * 2).every((row) => row[line] === ' ')) return false;
    for (let row = top.row * 2 + 1; row < low.row * 2; row += 1) write(canvas, row, line, road.open ? '│' : SHUT);
    return true;
  }
  if (low.row - top.row !== 1 || Math.abs(low.column - top.column) !== 1) return false;
  const corner = Math.min(top.column, low.column) * COLUMN + LABEL;
  if (!clear(canvas, top.row * 2 + 1, corner, corner + 1)) return false;
  write(canvas, top.row * 2 + 1, corner, road.open ? (low.column > top.column ? '\\' : '/') : SHUT);
  return true;
}

// A road between two rows that touch and columns that do not, drawn bending: out of the place above,
// along the line of paper the lattice leaves between the two rows, and into the place below. It is
// tried only once every road that can be drawn straight has been, so a bend never takes the paper a
// straight line wanted.
function bent(canvas: string[][], road: Road, from: Cell, to: Cell): boolean {
  const [top, low] = from.row < to.row ? [from, to] : [to, from];
  if (low.row - top.row !== 1 || top.column === low.column) return false;
  const row = top.row * 2 + 1;
  const [start, end] = [middleOf(top.column), middleOf(low.column)];
  const [left, right] = start < end ? [start, end] : [end, start];
  if (!clear(canvas, row, left, right + 1)) return false;
  const [opening, closing] = start < end ? ['└', '┐'] : ['┌', '┘'];
  write(canvas, row, left, road.open ? `${opening}${'─'.repeat(right - left - 1)}${closing}` : SHUT.repeat(right - left + 1));
  return true;
}

export function drawnMap(sheet: Sheet): string[] {
  if (sheet.nodes.length === 0) return [];
  const { cells, columns, rows, crowded } = lattice(sheet);
  const canvas = blank(columns.length * COLUMN, Math.max(1, rows.length * 2 - 1));
  for (const cell of cells.values()) write(canvas, cell.row * 2, cell.column * COLUMN, cell.label);

  const aside: string[] = [...crowded];
  const named = (road: Road): string =>
    `${cells.get(road.from)?.label ?? road.from} ${road.mutual ? '—' : '->'} ${cells.get(road.to)?.label ?? road.to}${road.open ? '' : ' (shut)'}`;

  const bending: { road: Road; from: Cell; to: Cell }[] = [];
  for (const road of sheet.roads) {
    const from = cells.get(road.from);
    const to = cells.get(road.to);
    if (!from || !to) aside.push(named(road));
    else if (!straight(canvas, road, from, to)) bending.push({ road, from, to });
  }
  for (const { road, from, to } of bending) if (!bent(canvas, road, from, to)) aside.push(named(road));

  const drawing = canvas.map((row) => row.join('').replace(/\s+$/, '')).filter((row, at, all) => row !== '' || all.slice(at + 1).some((rest) => rest !== ''));
  // The one line of legend, and only where it is needed: a dotted road is a road nobody can walk
  // today, which a reader has no way of guessing from the dots.
  const legend = sheet.roads.some((road) => !road.open) ? [`${SHUT.repeat(4)} a road that is shut`] : [];
  // A shape has nothing to draw in characters, so a region says instead what it gathers. A reader who
  // wants to know where the castle is looks at the rooms; this says which rooms are the castle.
  const shapes = sheet.regions.map((region) => `${String(region.title)}: ${region.drawn.map((held) => cells.get(String(held))?.label ?? String(held)).join(', ')}`);
  const under = [...legend, ...shapes, ...aside.map((line) => `also: ${line}`)];
  return under.length === 0 ? drawing : [...drawing, '', ...under];
}

const CELL = 18;

// The nine squares, drawn where they lie. Every way out that a heading points at sits in its own
// square under the number that walks it; the rest are said underneath, because up, down and a road
// that leads nowhere on the compass are not squares of a compass.
export function drawnCompass(sheet: Sheet, said: (way: Way) => string): string[] {
  const { cells, rest } = compassOf(sheet.ways);
  if (sheet.ways.length === 0) return [];
  const rows: string[] = [];
  for (let row = 0; row < 3; row += 1) {
    const drawn = COMPASS.slice(row * 3, row * 3 + 3).map((bearing, column) => {
      const way = cells[row * 3 + column];
      if (bearing === null) return cut(`${HERE} here`, CELL - 1).padEnd(CELL);
      return cut(way === null ? '' : `${way.at}: ${said(way)}`, CELL - 1).padEnd(CELL);
    });
    rows.push(`  ${drawn.join('')}`.replace(/\s+$/, ''));
  }
  return [...rows, ...rest.map((way) => `  also ${way.bearing === null ? 'from here' : way.bearing}: ${way.at}: ${said(way)}`)];
}
