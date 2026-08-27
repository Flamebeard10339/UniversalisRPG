import { COMPASS, compassOf, type Sheet, type Way } from '../../src/runtime/map';

// The map drawn as characters. Every fact in here comes off the sheet the engine built — which
// places, on which floor, joined by which roads, and which way each way out lies — so a terminal and
// the map pane are drawing one thing and can only disagree about how it looks.

const LABEL = 14;
const GAP = 3;
const COLUMN = LABEL + GAP;

const HERE = '>';
const SHUT = '·';
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
  return cut(`${node.here ? HERE : ''}${numbered}${climb}${String(node.place.title)}`, LABEL);
}

// The lattice the drawn positions make, with the columns and rows nothing stands on taken out. A
// terminal is eighty characters wide and a world is not, so what is kept is the order places stand in
// and not how far apart they were written. Roads are drawn between them, so nothing here claims two
// places touch — a square with no line to the square beside it is joined to nothing.
function lattice(sheet: Sheet): { cells: Map<string, Cell>; columns: number[]; rows: number[]; crowded: string[] } {
  const columns = [...new Set(sheet.nodes.map((node) => node.at.x))].sort((low, high) => low - high);
  const rows = [...new Set(sheet.nodes.map((node) => node.at.y))].sort((low, high) => high - low);
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

export function drawnMap(sheet: Sheet): string[] {
  if (sheet.nodes.length === 0) return [];
  const { cells, columns, rows, crowded } = lattice(sheet);
  const canvas = blank(columns.length * COLUMN, Math.max(1, rows.length * 2 - 1));
  for (const cell of cells.values()) write(canvas, cell.row * 2, cell.column * COLUMN, cell.label);

  const aside: string[] = [...crowded];
  for (const road of sheet.roads) {
    const from = cells.get(road.from);
    const to = cells.get(road.to);
    const named = `${cells.get(road.from)?.label ?? road.from} ${road.mutual ? '—' : '->'} ${cells.get(road.to)?.label ?? road.to}${road.open ? '' : ' (shut)'}`;
    if (!from || !to) {
      aside.push(named);
      continue;
    }
    const drawn = road.open ? '─' : SHUT;
    if (from.row === to.row) {
      const [left, right] = from.column < to.column ? [from, to] : [to, from];
      const span: [number, number] = [left.column * COLUMN + left.label.length, right.column * COLUMN];
      if (clear(canvas, left.row * 2, span[0], span[1])) write(canvas, left.row * 2, span[0], drawn.repeat(span[1] - span[0]));
      else aside.push(named);
      continue;
    }
    if (from.column === to.column) {
      const [top, low] = from.row < to.row ? [from, to] : [to, from];
      const line = middleOf(top.column);
      if (canvas.slice(top.row * 2 + 1, low.row * 2).every((row) => row[line] === ' ')) {
        for (let row = top.row * 2 + 1; row < low.row * 2; row += 1) write(canvas, row, line, road.open ? '│' : SHUT);
      } else aside.push(named);
      continue;
    }
    const [top, low] = from.row < to.row ? [from, to] : [to, from];
    if (low.row - top.row === 1 && Math.abs(low.column - top.column) === 1) {
      const slope = low.column > top.column ? '\\' : '/';
      const at = low.column > top.column ? top.column * COLUMN + LABEL : low.column * COLUMN + LABEL;
      write(canvas, top.row * 2 + 1, at, road.open ? slope : SHUT);
      continue;
    }
    aside.push(named);
  }

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
