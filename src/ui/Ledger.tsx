import { useRef, useState } from 'react';
import { gripFor, type Carried, type Grip } from './DragSheet';
import { fillOf } from './lineStyle';
import { droppedOn, type CellBox } from './packDrag';
import type { Entry } from './sheet';
import { doll, GRID, NAME, type Layout } from './sheetLayout';
import type { Point } from './viewport';
import { TOUCH_FLOOR } from './viewport';

const OPENER = 'absolute inset-0 z-10 w-full';

function Opener({ entry, onOpen, drag }: { entry: Entry; onOpen?: (id: string) => void; drag: Held | null }): JSX.Element | null {
  if (entry.id === undefined) return null;
  const key = entry.id;
  if (drag) return <button data-drive="send" type="button" aria-label={entry.name} ref={drag.measure(key)} {...drag.grip(key)} className={OPENER} />;
  if (!onOpen) return null;
  return <button data-drive="send" type="button" aria-label={entry.name} onClick={() => onOpen(key)} className={OPENER} />;
}

function Row({ entry, onOpen }: { entry: Entry; onOpen?: (id: string) => void }): JSX.Element {
  return (
    <div className="relative border-b border-border py-2 last:border-b-0 active:scale-[0.99] active:text-accent">
      <Opener entry={entry} onOpen={onOpen} drag={null} />
      <div className="flex items-baseline justify-between gap-3">
        <dt className={`min-w-0 flex-1 text-sm ${NAME}`}>{entry.name}</dt>
        <dd className="shrink-0 text-sm tabular-nums text-text-subtle">{entry.value}</dd>
      </div>
      {entry.detail ? <dd className="mt-0.5 text-xs tabular-nums text-text-muted">{entry.detail}</dd> : null}
    </div>
  );
}

const NOT_CARRIED: Point = { x: 0, y: 0 };

// Where a cell sits is the cell's own business: an entry that says where it belongs takes that
// square of whatever grid it is drawn in, and one that says nothing takes the next square going.
function Cell({ entry, onOpen, drag }: { entry: Entry; onOpen?: (id: string) => void; drag: Held | null }): JSX.Element {
  const held = drag?.carried ?? null;
  const by = held !== null && held.id === entry.id ? held.by : NOT_CARRIED;
  const lifted = by !== NOT_CARRIED;
  return (
    <div
      style={{
        minHeight: TOUCH_FLOOR,
        ...fillOf(entry.group),
        ...(entry.at === undefined ? {} : { gridColumn: entry.at.column, gridRow: entry.at.row }),
        ...(lifted ? { transform: `translate(${by.x}px, ${by.y}px)`, zIndex: 20 } : {}),
      }}
      className={`relative flex flex-col justify-center rounded-2xl border border-border bg-surface-raised px-2 py-2 transition-transform duration-75 active:scale-[0.98] active:border-accent ${
        lifted ? 'border-accent shadow-lg' : ''
      }`}
    >
      <Opener entry={entry} onOpen={onOpen} drag={drag} />
      <dt className={`w-full text-center text-xs font-semibold ${NAME}`}>{entry.name}</dt>
      <dd className={`w-full text-center text-xs tabular-nums text-text-subtle ${NAME}`}>{entry.value}</dd>
      {entry.detail ? <dd className={`w-full text-center text-xs tabular-nums text-text-muted ${NAME}`}>{entry.detail}</dd> : null}
    </div>
  );
}

const keyOf = (entry: Entry): string => entry.id ?? entry.name;

interface Held {
  grip(key: string): Grip;
  measure(key: string): (element: HTMLElement | null) => void;
  carried: Carried | null;
}

// Picking a cell up off the sheet, carrying it, and putting it down on another. The grip is the one
// the map and the plane are dragged by, at the page's own scale, so what it reports is already in
// the pixels the cells were measured in. A press that went nowhere is a tap and opens the thing.
function useHeld(onOpen?: (id: string) => void, onSwap?: (one: string, other: string) => void): Held | null {
  const drawn = useRef(new Map<string, HTMLElement>());
  const holding = useRef<{ id: string; from: Point } | null>(null);
  const [carried, setCarried] = useState<Carried | null>(null);
  if (!onSwap) return null;

  const boxes = (): CellBox[] =>
    [...drawn.current].map(([key, element]) => {
      const box = element.getBoundingClientRect();
      return { key, left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    });

  return {
    carried,
    measure: (key) => (element) => void (element === null ? drawn.current.delete(key) : drawn.current.set(key, element)),
    grip: (key) =>
      gripFor(key, holding, 1, {
        hold: setCarried,
        rest: (report) => {
          setCarried(null);
          if (!report) return onOpen?.(key);
          const onto = droppedOn(boxes(), report.id, report.by);
          if (onto !== null) onSwap(report.id, onto);
        },
      }),
  };
}

function Body({ entries, layout, onOpen, drag }: { entries: readonly Entry[]; layout: Layout; onOpen?: (id: string) => void; drag: Held | null }): JSX.Element {
  if (layout === 'list') {
    return (
      <dl className="mx-auto flex max-w-2xl flex-col">
        {entries.map((entry) => (
          <Row key={keyOf(entry)} entry={entry} onOpen={onOpen} />
        ))}
      </dl>
    );
  }

  if (layout === 'grid') {
    return (
      <dl className={`mx-auto max-w-2xl ${GRID}`}>
        {entries.map((entry) => (
          <Cell key={keyOf(entry)} entry={entry} onOpen={onOpen} drag={drag} />
        ))}
      </dl>
    );
  }

  const { body, beneath, columns, rows } = doll(entries);
  return (
    <dl className="mx-auto flex max-w-2xl flex-col gap-3">
      {columns > 0 ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
          {body.map((entry) => (
            <Cell key={keyOf(entry)} entry={entry} onOpen={onOpen} drag={null} />
          ))}
        </div>
      ) : null}
      {beneath.length > 0 ? (
        <div className={GRID}>
          {beneath.map((entry) => (
            <Cell key={keyOf(entry)} entry={entry} onOpen={onOpen} drag={null} />
          ))}
        </div>
      ) : null}
    </dl>
  );
}

export function Ledger({ entries, layout = 'list', onOpen, onSwap }: { entries: readonly Entry[]; layout?: Layout; onOpen?: (id: string) => void; onSwap?: (one: string, other: string) => void }): JSX.Element {
  const drag = useHeld(onOpen, onSwap);
  return (
    <div className="unbarred min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Body entries={entries} layout={layout} onOpen={onOpen} drag={layout === 'grid' ? drag : null} />
    </div>
  );
}
