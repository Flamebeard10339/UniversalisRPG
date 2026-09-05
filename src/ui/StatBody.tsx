import { CARD } from './sheetLayout';
import type { StatRow } from '../runtime/session';
import { madeOf } from '../runtime/statScreen';
import { tidy } from './format';
import { fillOf } from './lineStyle';
import { NAME } from './sheetLayout';
import { useTestSurface } from './useTestSurface';

export function StatBody({ row }: { row: StatRow }): JSX.Element {
  useTestSurface('stat', { row });

  return (
    <div style={fillOf(row.group)} className={CARD}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={`min-w-0 text-base font-semibold ${NAME}`}>{row.title}</h3>
        <p className="shrink-0 text-base tabular-nums">{tidy(row.value)}</p>
      </div>
      <dl className="unbarred mt-2 flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
        {madeOf(row.from).map((share, at) => (
          <div key={at} className="flex items-baseline justify-between gap-3 border-b border-border py-1 last:border-b-0">
            <dt className={`min-w-0 flex-1 text-sm ${NAME}`}>{share.title}</dt>
            <dd className="shrink-0 text-sm tabular-nums text-accent">{share.worth}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
