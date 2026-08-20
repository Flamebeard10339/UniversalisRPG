import { useState } from 'react';
import { DevOnly } from './DevOnly';
import { devLine, speedLine } from './devMode';
import type { Words } from './words';

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

export function SettingsPane({ dev, speed, words, onSend }: { dev: boolean; speed: number; words: Words; onSend: (line: string) => void }): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text">
        <span>{words('dev')}</span>
        <input data-drive="send" type="checkbox" checked={dev} onChange={(event) => onSend(devLine(event.target.checked))} className="accent-accent" />
      </label>

      <DevOnly dev={dev}>
        <SpeedField key={speed} speed={speed} words={words} onSend={onSend} />
      </DevOnly>
    </div>
  );
}
