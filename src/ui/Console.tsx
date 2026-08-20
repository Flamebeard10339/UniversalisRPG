import { useState } from 'react';
import { typed } from './consoleLine';
import type { Words } from './words';

export function Console({ onSend, words }: { onSend: (line: string) => void; words: Words }): JSX.Element {
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
        data-drive="send"
        className="flex-1 select-text rounded-xl border border-border bg-panel px-3 text-text outline-none focus:border-accent"
        aria-label={words('command')}
        value={line}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setLine(event.target.value)}
      />
      <button
        data-drive="send"
        type="submit"
        className="shrink-0 rounded-xl bg-accent px-3 text-sm font-medium text-accent-text transition-transform duration-75 active:scale-[0.97]"
      >
        {words('run')}
      </button>
    </form>
  );
}
