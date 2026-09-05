import { CARD } from './sheetLayout';
import type { Localized } from '../runtime/localized';
import { formatClock, tidy } from './format';
import { NAME } from './sheetLayout';
import { perHour, untilNext, type SkillPanel, type XpMark } from './skillPanels';
import { useTestSurface } from './useTestSurface';
import type { Words } from './words';

function Fact({ name, value }: { name: Localized; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1 last:border-b-0">
      <dt className="text-xs uppercase tracking-wide text-text-subtle">{name}</dt>
      <dd className="shrink-0 text-sm tabular-nums">{value}</dd>
    </div>
  );
}

export function SkillBody({ panel, first, now, words }: { panel: SkillPanel; first: XpMark | null; now: XpMark; words: Words }): JSX.Element {
  const rate = first === null ? null : perHour(first, now, panel.id);
  const left = untilNext(panel, rate);

  useTestSurface('skill', { panel, rate });

  return (
    <div className={CARD}>
      <h3 className={`min-w-0 text-base font-semibold ${NAME}`}>{panel.title}</h3>
      <dl className="mt-2 flex flex-col gap-1">
        <Fact name={words('level')} value={tidy(panel.level)} />
        <Fact name={words('experience')} value={tidy(panel.total)} />
        <Fact name={words('to-next')} value={tidy(panel.toNext)} />
        <Fact name={words('an-hour')} value={rate === null ? '—' : tidy(Math.round(rate))} />
        <Fact name={words('until-next')} value={left === null ? '—' : formatClock(Math.round(left))} />
      </dl>
    </div>
  );
}
