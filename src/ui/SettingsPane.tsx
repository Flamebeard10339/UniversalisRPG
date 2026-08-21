import { DevOnly } from './DevOnly';
import { devLine, RATES, speedLine } from './devMode';
import type { Words } from './words';

function Rates({ speed, words, onSend }: { speed: number; words: Words; onSend: (line: string) => void }): JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
      <span className="mr-auto">{words('speed')}</span>
      {RATES.map((rate) => (
        <button
          key={rate}
          data-drive="send"
          data-rate={rate}
          data-running={rate === speed ? 'yes' : undefined}
          type="button"
          onClick={() => onSend(speedLine(String(rate)))}
          className={`shrink-0 rounded-xl border px-3 text-sm tabular-nums transition-transform duration-75 active:scale-[0.97] ${
            rate === speed ? 'border-accent bg-accent-strong font-semibold text-accent-text' : 'border-border bg-surface text-text-subtle'
          }`}
        >
          {`${rate}\u00d7`}
        </button>
      ))}
    </div>
  );
}

export function SettingsPane({ dev, speed, words, onSend }: { dev: boolean; speed: number; words: Words; onSend: (line: string) => void }): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
        <span>{words('dev')}</span>
        <input data-drive="send" type="checkbox" checked={dev} onChange={(event) => onSend(devLine(event.target.checked))} className="accent-accent" />
      </label>

      <DevOnly dev={dev}>
        <Rates speed={speed} words={words} onSend={onSend} />
      </DevOnly>
    </div>
  );
}
