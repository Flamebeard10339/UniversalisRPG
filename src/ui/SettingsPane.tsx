import { DevOnly } from './DevOnly';
import { devLine, speedLine } from './devMode';
import type { Words } from './words';

// The page the dev slot is entered from, and the only page that draws a control
// for entering it. The toggle is that entry and not a second one: what it does
// is send the line the REPL sends, so the snapshot, the slot and the way back
// out are the command table's and this holds no flag of its own (c7).
//
// The dial below it is the one `/speed` turns. Its value is read off the
// session every render rather than kept here, so setting it from this field and
// setting it from the console are indistinguishable afterwards, and there is no
// second default and no second clamp for the two to disagree about (c10).
export function SettingsPane({ dev, speed, words, onSend }: { dev: boolean; speed: number | null; words: Words; onSend: (line: string) => void }): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
        <span>{words('dev')}</span>
        <input data-drive="send" type="checkbox" checked={dev} onChange={(event) => onSend(devLine(event.target.checked))} className="accent-accent" />
      </label>

      <DevOnly dev={dev}>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
          <span>{words('speed')}</span>
          <input
            data-drive="send"
            type="number"
            inputMode="decimal"
            value={speed ?? ''}
            onChange={(event) => onSend(speedLine(Number(event.target.value)))}
            className="w-24 select-text rounded-xl border border-border bg-surface px-3 text-right tabular-nums text-text outline-none focus:border-accent"
          />
        </label>
      </DevOnly>
    </div>
  );
}
