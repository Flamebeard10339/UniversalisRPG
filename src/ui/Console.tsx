import { useState } from 'react';
import { typed } from './consoleLine';
import { LABELS } from './labels';

// The line the REPL takes, typed on a phone. Whatever is written goes straight
// to the container's dispatch, so every command the shared table defines is
// reachable from the GUI and none of them is named here. What comes back is
// engine output like any other and lands in the log on Home.
export function Console({ onSend }: { onSend: (line: string) => void }): JSX.Element {
  const [line, setLine] = useState('');

  return (
    <form
      className="mt-auto flex shrink-0 items-center gap-2 border-t border-border bg-surface-raised p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const command = typed(line);
        if (!command) return;
        onSend(command);
        setLine('');
      }}
    >
      <input
        className="flex-1 select-text rounded-xl border border-border bg-panel px-3 text-text outline-none focus:border-accent"
        aria-label={LABELS.command}
        value={line}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setLine(event.target.value)}
      />
      <button
        type="submit"
        className="shrink-0 rounded-xl bg-accent px-3 text-sm font-medium text-accent-text transition-transform duration-75 active:scale-[0.97]"
      >
        {LABELS.run}
      </button>
    </form>
  );
}
