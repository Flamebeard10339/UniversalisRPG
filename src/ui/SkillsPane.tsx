import { useState } from 'react';
import type { Answer, Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';
import { formatClock, tidy } from './format';
import { filled, perHour, skillPanels, untilNext, type SkillPanel, type XpMark } from './skillPanels';
import { useTestSurface } from './testSurface';
import { useMoment } from './transient';
import type { Crossings } from './levelling';
import type { Words } from './words';

// The character's skills, one panel each: the level inside the ring that fills
// toward the next one. Everything drawn is derived from the total the view
// publishes, so the page holds no number of its own.

// The ring, drawn in a box of forty. Its circumference is what a dash pattern
// is measured in, so the fraction the level has covered is a length and not a
// second unit.
const RING_RADIUS = 17;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function Ring({ panel, greeted }: { panel: SkillPanel; greeted: boolean }): JSX.Element {
  const flash = useMoment('arrival', greeted, panel.id);

  return (
    <span className={`relative flex h-16 w-16 items-center justify-center rounded-full ${flash}`}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40" aria-hidden>
        <circle cx={20} cy={20} r={RING_RADIUS} className="fill-none stroke-panel" strokeWidth={4} />
        <circle
          cx={20}
          cy={20}
          r={RING_RADIUS}
          className="fill-none stroke-accent"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - filled(panel))}
        />
      </svg>
      <span className="text-lg font-semibold tabular-nums">{tidy(panel.level)}</span>
    </span>
  );
}

export function SkillsPane({ view, first, crossed, words }: { view: PlayView | null; first: XpMark | null; crossed: Crossings; words: Words }): JSX.Element {
  const [opened, setOpened] = useState<Answer | null>(null);
  const panels = skillPanels(view?.xp ?? []);
  const shown = panels.find((panel) => panel.id === opened) ?? null;
  const now = { at: view?.time ?? 0, totals: Object.fromEntries((view?.xp ?? []).map((row) => [row.id, row.value])) };
  const rate = shown === null || first === null ? null : perHour(first, now, shown.id);
  const left = shown === null ? null : untilNext(shown, rate);

  useTestSurface('skills', { panels, opened, greeted: [...crossed.greeted], controls: { open: setOpened } });

  return (
    // The page and what it opens over it, in that order. `absolute` and not
    // `fixed`: the pages ride on a strip this shell moves with a transform, and
    // a fixed child of a transformed element is positioned against that element
    // rather than against the window — which puts it a page's width off screen.
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="unbarred min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto grid max-w-2xl grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-3">
          {panels.map((panel) => (
            <button
              key={panel.id}
              data-drive="skills.open"
              data-skill={panel.id}
              type="button"
              onClick={() => setOpened(panel.id)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface-raised px-3 py-3 transition-transform duration-75 active:scale-[0.98] active:border-accent"
            >
              <span className="w-full truncate text-center text-sm font-semibold">{panel.title}</span>
              <Ring key={`${panel.id}-${crossed.greeted.has(panel.id) ? crossed.generation : 0}`} panel={panel} greeted={crossed.greeted.has(panel.id)} />
            </button>
          ))}
        </div>
      </div>

      {shown === null ? null : (
        <div
          data-drive="dismiss"
          role="dialog"
          aria-modal
          onClick={(event) => void (event.target === event.currentTarget && setOpened(null))}
          className="absolute inset-0 z-50 flex flex-col justify-end bg-scrim px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-surface-raised p-4">
            <p className="text-base font-semibold">{shown.title}</p>
            <dl className="mt-2 flex flex-col gap-1">
              <Fact name={words('level')} value={tidy(shown.level)} />
              <Fact name={words('experience')} value={tidy(shown.total)} />
              <Fact name={words('to-next')} value={tidy(shown.toNext)} />
              <Fact name={words('an-hour')} value={rate === null ? '—' : tidy(Math.round(rate))} />
              <Fact name={words('until-next')} value={left === null ? '—' : formatClock(Math.round(left))} />
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ name, value }: { name: Localized; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1 last:border-b-0">
      <dt className="text-xs uppercase tracking-wide text-text-subtle">{name}</dt>
      <dd className="text-sm tabular-nums">{value}</dd>
    </div>
  );
}
