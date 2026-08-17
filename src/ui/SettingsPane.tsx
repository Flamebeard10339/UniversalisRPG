import { useState } from 'react';
import { DevOnly } from './DevOnly';
import { devLine, speedLine } from './devMode';
import type { Words } from './words';

// The dial `/speed` turns, typed at — the same shape the console has, because
// it is the same thing: a field somebody types in and a line that goes when
// they are done. What the field holds meanwhile is text, and it is re-keyed on
// the session's own value by its caller, so the moment the dial moves — from
// here or from a typed line — the field is that value again and there is
// nothing here to fall out of step with it.
function SpeedField({ speed, words, onSend }: { speed: number; words: Words; onSend: (line: string) => void }): JSX.Element {
  const [typed, setTyped] = useState(String(speed));

  return (
    <form
      className="flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text"
      onSubmit={(event) => {
        event.preventDefault();
        onSend(speedLine(typed));
      }}
    >
      <span className="mr-auto">{words('speed')}</span>
      <input
        data-drive="send"
        className="w-20 select-text rounded-xl border border-border bg-surface px-3 text-right tabular-nums text-text outline-none focus:border-accent"
        aria-label={words('speed')}
        inputMode="decimal"
        value={typed}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setTyped(event.target.value)}
      />
      <button data-drive="send" type="submit" className="shrink-0 rounded-xl bg-accent px-3 text-sm font-medium text-accent-text transition-transform duration-75 active:scale-[0.97]">
        {words('run')}
      </button>
    </form>
  );
}

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
        {/* Re-keyed on the dial, so a `/speed` typed at the console puts this
            field where it put the dial and no effect here has to notice. */}
        {speed === null ? null : <SpeedField key={speed} speed={speed} words={words} onSend={onSend} />}
      </DevOnly>
    </div>
  );
}
