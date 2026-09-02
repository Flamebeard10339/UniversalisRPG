import { useRef, useState } from 'react';
import { gripFor, type Carried, type Grip, type Gripped } from './DragSheet';
import { itemStyle } from './itemLook';
import { fillOf } from './lineStyle';
import { letGoOf, type CellBox } from './packDrag';
import { LIFT_MS } from './gesture';
import { PLUCKED } from './transient';
import type { Entry } from './sheet';
import { doll, GRID, NAME, SLOTS, type Layout } from './sheetLayout';
import type { Point } from './viewport';
import { TOUCH_FLOOR } from './viewport';

const OPENER = 'absolute inset-0 z-10 h-full w-full';

function Opener({ entry, onOpen, drag }: { entry: Entry; onOpen?: (id: string) => void; drag: Held | null }): JSX.Element | null {
  if (entry.id === undefined) return null;
  const key = entry.id;
  if (drag) return <button data-drive="send" type="button" aria-label={entry.name} ref={drag.measure(key)} {...drag.grip(key)} data-still style={{ touchAction: 'pan-y' }} className={OPENER} />;
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

function Cell({ entry, onOpen, drag }: { entry: Entry; onOpen?: (id: string) => void; drag: Held | null }): JSX.Element {
  const held = drag?.carried ?? null;
  const by = held !== null && held.id === entry.id ? held.by : NOT_CARRIED;
  const lifted = by !== NOT_CARRIED;
  return (
    <div
      style={{
        minHeight: TOUCH_FLOOR,
        ...(entry.look === undefined ? fillOf(entry.group) : itemStyle(entry.look, entry.grown === true)),
        ...(entry.at === undefined ? {} : { gridColumn: entry.at.column, gridRow: entry.at.row }),
        ...(lifted ? { transform: `translate(${by.x}px, ${by.y}px)`, zIndex: 20 } : {}),
      }}
      className={`relative flex h-full min-w-0 flex-col justify-center overflow-hidden rounded-2xl border border-border bg-surface-raised px-2 py-2 ${
        lifted ? `border-accent shadow-lg ${PLUCKED}` : 'transition-transform duration-75 active:scale-[0.98] active:border-accent'
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

function useHeld(onOpen?: (id: string) => void, onSwap?: (one: string, other: string) => void): Held | null {
  const drawn = useRef(new Map<string, HTMLElement>());
  const holding = useRef<Gripped | null>(null);
  const laid = useRef<CellBox[]>([]);
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
      gripFor(
        key,
        holding,
        1,
        {
          hold: (next) => {
            if (holding.current?.id === key && laid.current.length === 0) laid.current = boxes();
            setCarried(next);
          },
          rest: (report) => {
            setCarried(null);
            const wasLaidOut = laid.current;
            laid.current = [];
            const asked = letGoOf(wasLaidOut, key, report?.by ?? null);
            if (asked.kind === 'swap') onSwap(asked.one, asked.other);
            if (asked.kind === 'open') onOpen?.(asked.one);
          },
        },
        LIFT_MS,
      ),
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
      <dl className={`mx-auto max-w-2xl ${SLOTS}`}>
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
