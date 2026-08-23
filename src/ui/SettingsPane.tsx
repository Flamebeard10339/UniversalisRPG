import { DevOnly } from './DevOnly';
import { devLine, RATES, speedLine } from './devMode';
import type { SettingRow } from '../runtime/session';
import { settingLine, standsAt } from './settingLines';
import type { Words } from './words';

// One row per preference the engine publishes, drawn off the live view rather than off a list of
// this page's own: a setting declared next month arrives here with nothing edited, and picking one
// sends the line a player would have typed.
function Preference({ row, onSend }: { row: SettingRow; onSend: (line: string) => void }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
      <div className="flex items-center gap-2">
        <span className="mr-auto">{row.title}</span>
        {row.choices.map((choice) => (
          <button
            key={choice.written}
            data-drive="send"
            data-setting={row.name}
            data-choice={choice.written}
            data-standing={standsAt(row, choice.written) ? 'yes' : undefined}
            type="button"
            onClick={() => onSend(settingLine(row.name, choice.written))}
            className={`shrink-0 rounded-xl border px-3 text-sm transition-transform duration-75 active:scale-[0.97] ${
              standsAt(row, choice.written) ? 'border-accent bg-accent-strong font-semibold text-accent-text' : 'border-border bg-surface text-text-subtle'
            }`}
          >
            {choice.shown}
          </button>
        ))}
      </div>
      <span className="text-xs text-text-subtle">{row.note}</span>
    </div>
  );
}

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

export function SettingsPane({
  dev,
  speed,
  settings,
  commandLine,
  words,
  onSend,
  onCommandLine,
}: {
  dev: boolean;
  speed: number;
  settings: readonly SettingRow[];
  commandLine: boolean;
  words: Words;
  onSend: (line: string) => void;
  onCommandLine: (shown: boolean) => void;
}): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      {settings.map((row) => (
        <Preference key={row.name} row={row} onSend={onSend} />
      ))}

      <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
        <span>{words('dev')}</span>
        <input data-drive="send" type="checkbox" checked={dev} onChange={(event) => onSend(devLine(event.target.checked))} className="accent-accent" />
      </label>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
        <span>{words('command-line')}</span>
        <input
          data-drive="shell.command-line"
          type="checkbox"
          checked={commandLine}
          onChange={(event) => onCommandLine(event.target.checked)}
          className="accent-accent"
        />
      </label>

      <DevOnly dev={dev}>
        <Rates speed={speed} words={words} onSend={onSend} />
      </DevOnly>
    </div>
  );
}
